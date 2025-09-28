/**
 * LAUNDRY KING POS - ARCHITECTURAL RULES & DATABASE STRUCTURE
 * ========================================================
 * 
 * OFFLINE-FIRST PRINCIPLES:
 * ------------------------
 * 1. All operations MUST work offline by default
 * 2. Data is stored locally first (localStorage/IndexedDB)
 * 3. Server sync ONLY happens when "Save Progress" is explicitly triggered
 * 4. No automatic server connections or background syncs
 * 
 * DATABASE RELATIONSHIPS:
 * ---------------------
 * user_profiles (Central Employee Table)
 * └── id (uuid) PRIMARY KEY
 * └── full_name, email, role
 * 
 * employee_timesheets
 * └── employee_id → user_profiles.id
 * └── Tracks: clock in/out times, work duration
 * 
 * pos_sessions
 * └── employee_id → user_profiles.id
 * └── Tracks: cash, totals, session status
 *     ├── pos_inventory_items
 *     │   └── pos_session_id → pos_sessions.id
 *     │   └── Tracks: item counts, sales, stock
 *     │
 *     └── pos_wash_dry_tickets
 *         └── pos_session_id → pos_sessions.id
 *         └── Tracks: ticket numbers, amounts
 * 
 * DATA FLOW:
 * ----------
 * 1. All operations save to localStorage first
 * 2. "Save Progress" button triggers:
 *    a) Get employee_id from user_profiles
 *    b) Create/update pos_session
 *    c) Link inventory items and tickets to session
 *    d) Update employee timesheet if needed
 * 
 * VALIDATION RULES:
 * ---------------
 * 1. Every operation must work without server connection
 * 2. All server sync operations must be atomic
 * 3. All relationships must be preserved during sync
 * 4. Data integrity must be maintained offline and online
 */

import { supabase, withSessionRetry } from '../lib/supabase';

// Cache for table existence check
let timesheetTableExists = null;

class TimesheetService {
  // Check if timesheet table exists
  async checkTimesheetTable() {
    if (timesheetTableExists !== null) return timesheetTableExists;
    
    try {
      // Try a simple query to check if table exists
      const { data, error } = await supabase
        .from('employee_timesheets')
        .select('*')
        .limit(1);
      
      // If no error or error is not about missing table
      timesheetTableExists = !error || error.code !== '42P01';
    } catch (e) {
      console.warn('Error checking timesheet table:', e);
      timesheetTableExists = false;
    }
    
    return timesheetTableExists;
  }
  
  // Helper to handle operations when table doesn't exist
  async handleMissingTable(operation) {
    console.warn(`Timesheet table not available, skipping ${operation}`);
    return { data: null, error: { message: 'Timesheet functionality not available' } };
  }
    // Get timesheets from local storage
  getLocalTimesheets() {
    const timesheets = localStorage.getItem('local_timesheets');
    return timesheets ? JSON.parse(timesheets) : [];
  }

  // Save timesheets to local storage
  saveLocalTimesheets(timesheets) {
    localStorage.setItem('local_timesheets', JSON.stringify(timesheets));
  }

  // Check if employee has an active clock-in
  hasActiveClockIn(employeeId) {
    const timesheets = this.getLocalTimesheets();
    return timesheets.some(entry => 
      entry.employee_id === employeeId && 
      entry.status === 'clocked_in' && 
      !entry.clock_out_time
    );
  }

  // Get active clock-in for employee
  getActiveClockIn(employeeId) {
    const timesheets = this.getLocalTimesheets();
    return timesheets.find(entry => 
      entry.employee_id === employeeId && 
      entry.status === 'clocked_in' && 
      !entry.clock_out_time
    );
  }

  // Clock in an employee (local storage only)
  async clockIn(employeeId) {
    try {
      const currentTime = new Date().toISOString();
      const sessionDate = new Date().toISOString().split('T')[0];
      
      // Get existing timesheets from local storage
      const timesheets = this.getLocalTimesheets();
      
      // Check if already clocked in
      const existingEntry = timesheets.find(entry => 
        entry.employee_id === employeeId && 
        entry.session_date === sessionDate && 
        entry.status === 'clocked_in' &&
        !entry.clock_out_time
      );
      
      if (existingEntry) {
        console.log('Already clocked in, returning existing entry');
        return { data: existingEntry, error: null };
      }
      
      // Create new clock-in entry
      const newEntry = {
        id: `local-${Date.now()}`,
        employee_id: employeeId,
        clock_in_time: currentTime,
        session_date: sessionDate,
        status: 'clocked_in',
        created_at: currentTime,
        updated_at: currentTime,
        is_local: true  // Mark as local entry
      };
      
      // Add to local storage
      timesheets.push(newEntry);
      this.saveLocalTimesheets(timesheets);
      
      console.log('Clock in saved to local storage:', newEntry);
      return { data: newEntry, error: null };
      
    } catch (error) {
      console.error('Error in local clockIn:', error);
      return { 
        data: null, 
        error: { 
          message: 'Failed to clock in locally',
          details: error.message 
        } 
      };
    }
  }

  // Enhanced clock-out for non-authenticated employee terminals
  async clockOutByName(employeeName) {
    // Local storage implementation doesn't need to check for table
    if (!employeeName?.trim()) {
      return { 
        data: null, 
        error: { message: 'Employee name is required' } 
      };
    }
    
    return withSessionRetry(async () => {
      try {
        if (!employeeName?.trim()) {
          throw new Error('Employee name is required');
        }

        const currentTime = new Date()?.toISOString();
        const sessionDate = new Date()?.toISOString()?.split('T')?.[0];

        // Find employee by name
        const { data: employee, error: employeeError } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .ilike('full_name', employeeName?.trim())
          .single();

        if (employeeError) {
          console.error('Employee lookup error:', employeeError);
          throw new Error(`Employee "${employeeName}" not found in system`);
        }

        // Try to find active timesheet for today
        let activeTimesheet = null;
        
        try {
          const { data: timesheetData, error: findError } = await supabase
            .from('employee_timesheets')
            .select('*')
            .eq('employee_id', employee?.id)
            .eq('session_date', sessionDate)
            .eq('status', 'clocked_in')
            .not('clock_in_time', 'is', null)
            .is('clock_out_time', null)
            .maybeSingle();
            
          if (!findError && timesheetData) {
            activeTimesheet = timesheetData;
          } else if (findError?.code === 'PGRST116' || findError?.code === '42P01') {
            // No active timesheet found or table doesn't exist
            console.warn('No active timesheet found or table not accessible:', findError);
          }
        } catch (e) {
          console.warn('Error finding active timesheet:', e);
        }

        // If still no active timesheet, check for any recent records
        if (!activeTimesheet) {
          try {
            const { data: recentTimesheets, error: recentError } = await supabase
              .from('employee_timesheets')
              .select('*')
              .eq('employee_id', employee?.id)
              .eq('session_date', sessionDate)
              .not('clock_in_time', 'is', null)
              .order('clock_in_time', { ascending: false })
              .limit(3);

            if (!recentError && recentTimesheets?.length > 0) {
              // Try to find a record that can be clocked out
              activeTimesheet = recentTimesheets.find(record => 
                record?.clock_in_time && 
                (!record?.clock_out_time || record?.status !== 'clocked_out')
              );
            }
          } catch (e) {
            console.warn('Error checking recent timesheets:', e);
          }
        }

      // If still no active timesheet found, provide helpful error
      if (!activeTimesheet) {
        // Check if there are any records for today at all
        const { data: todayRecords } = await supabase
          ?.from('employee_timesheets')
          ?.select('*')
          ?.eq('employee_id', employee?.id)
          ?.eq('session_date', sessionDate);

        if (!todayRecords || todayRecords?.length === 0) {
          throw new Error(`${employee?.full_name} has not clocked in today. Please clock in first before attempting to clock out.`);
        } else {
          // There are records but none are valid for clock out
          const hasValidClockIn = todayRecords?.some(r => r?.clock_in_time && r?.status === 'clocked_in');
          const hasClockOut = todayRecords?.some(r => r?.clock_out_time && r?.status === 'clocked_out');
          
          if (hasClockOut && !hasValidClockIn) {
            throw new Error(`${employee?.full_name} has already clocked out today. Current session is already completed.`);
          } else {
            throw new Error(`No valid active clock-in session found for ${employee?.full_name} today. There may be data corruption - please contact admin.`);
          }
        }
      }

      // Update timesheet with clock-out
      const { data: updatedTimesheet, error: updateError } = await supabase
        ?.from('employee_timesheets')
        ?.update({
          clock_out_time: currentTime,
          status: 'clocked_out'
        })
        ?.eq('id', activeTimesheet?.id)
        ?.select()
        ?.single();

      if (updateError) throw updateError;

      return {
        ...updatedTimesheet,
        employee_name: employee?.full_name
      };
      } catch (error) {
        console.error('Error in clockOutByName:', error);
        return { data: null, error };
      }
    }, 'Clock out by name operation');
  }

  // Enhanced clock-in for non-authenticated employee terminals
  async clockInByName(employeeName) {
    return withSessionRetry(async () => {
      if (!employeeName?.trim()) {
        throw new Error('Employee name is required');
      }

      const currentTime = new Date()?.toISOString();
      const sessionDate = new Date()?.toISOString()?.split('T')?.[0];

      // Find employee by name
      const { data: employee, error: employeeError } = await supabase
        ?.from('user_profiles')
        ?.select('id, full_name')
        ?.ilike('full_name', employeeName?.trim())
        ?.single();

      if (employeeError) {
        throw new Error(`Employee "${employeeName}" not found in system`);
      }

      // Check if already clocked in today
      const { data: existingTimesheet, error: checkError } = await supabase
        ?.from('employee_timesheets')
        ?.select('*')
        ?.eq('employee_id', employee?.id)
        ?.eq('session_date', sessionDate)
        ?.eq('status', 'clocked_in')
        ?.single();

      if (existingTimesheet) {
        throw new Error(`${employee?.full_name} is already clocked in today at ${new Date(existingTimesheet?.clock_in_time)?.toLocaleTimeString()}`);
      }

      // Create new timesheet
      const { data: newTimesheet, error: createError } = await supabase
        ?.from('employee_timesheets')
        ?.insert([{
          employee_id: employee?.id,
          clock_in_time: currentTime,
          session_date: sessionDate,
          status: 'clocked_in'
        }])
        ?.select()
        ?.single();

      if (createError) throw createError;

      return {
        ...newTimesheet,
        employee_name: employee?.full_name
      };
    }, 'Clock in by name operation');
  }

  // Get timesheet for specific employee and date
  async getTimesheetByDate(employeeId, date) {
    return withSessionRetry(async () => {
      const { data, error } = await supabase
        ?.from('employee_timesheets')
        ?.select('*')
        ?.eq('employee_id', employeeId)  // Using employee_id (UUID)
        ?.eq('session_date', date)       // Using session_date
        ?.single();

      if (error && error?.code !== 'PGRST116') throw error;
      return data || null;
    }, 'Get timesheet by date');
  }

  // Get all timesheets for an employee
  async getEmployeeTimesheets(employeeId, limit = 30) {
    return withSessionRetry(async () => {
      const { data, error } = await supabase
        ?.from('employee_timesheets')
        ?.select('*')
        ?.eq('employee_id', employeeId)  // Using employee_id (UUID)
        ?.order('session_date', { ascending: false })  // Using session_date
        ?.limit(limit);

      if (error) throw error;
      return data || [];
    }, 'Get employee timesheets');
  }

  // Local storage keys
  getLocalStorageKey(employeeId) {
    return `timesheet_${employeeId}_${new Date().toISOString().split('T')[0]}`;
  }

  // Get current clock status from local storage only
  async getCurrentClockStatus(employeeId, employeeName = null) {
    try {
      if (!employeeId && !employeeName) {
        return { isClocked: false, timesheet: null };
      }

      // If we only have name, use it as the ID for local storage
      const storageKey = this.getLocalStorageKey(employeeId || employeeName);
      const storedData = localStorage.getItem(storageKey);
      
      if (storedData) {
        const timesheet = JSON.parse(storedData);
        const isClockedIn = timesheet.status === 'clocked_in' && !timesheet.clock_out_time;
        return { isClocked: isClockedIn, timesheet: isClockedIn ? timesheet : null };
      }
      
      return { isClocked: false, timesheet: null };
      
    } catch (error) {
      console.error('Error getting clock status from local storage:', error);
      return { isClocked: false, timesheet: null };
    }
  }

  // Clock in to local storage only
  async clockIn(employeeId, employeeName = null) {
    try {
      if (!employeeId && !employeeName) {
        throw new Error('Employee ID or name is required');
      }

      const identifier = employeeId || employeeName;
      const storageKey = this.getLocalStorageKey(identifier);
      const now = new Date().toISOString();
      
      const timesheet = {
        id: `local_${Date.now()}`,
        employee_id: employeeId || null,
        employee_name: employeeName || null,
        clock_in_time: now,
        clock_out_time: null,
        session_date: now.split('T')[0],
        status: 'clocked_in',
        total_hours: 0,
        created_at: now,
        updated_at: now,
        is_synced: false
      };

      localStorage.setItem(storageKey, JSON.stringify(timesheet));
      return { data: timesheet, error: null };
      
    } catch (error) {
      console.error('Error in local clock in:', error);
      return { data: null, error };
    }
  }

  // Clock out in local storage only
  async clockOut(employeeId, employeeName = null) {
    try {
      if (!employeeId && !employeeName) {
        throw new Error('Employee ID or name is required');
      }

      const identifier = employeeId || employeeName;
      const storageKey = this.getLocalStorageKey(identifier);
      const storedData = localStorage.getItem(storageKey);
      
      if (!storedData) {
        throw new Error('No active clock-in found');
      }

      const timesheet = JSON.parse(storedData);
      if (timesheet.status !== 'clocked_in' || timesheet.clock_out_time) {
        throw new Error('No active clock-in session found');
      }

      const now = new Date();
      const clockInTime = new Date(timesheet.clock_in_time);
      const hoursWorked = (now - clockInTime) / (1000 * 60 * 60); // Convert ms to hours

      const updatedTimesheet = {
        ...timesheet,
        clock_out_time: now.toISOString(),
        status: 'clocked_out',
        total_hours: hoursWorked.toFixed(2),
        updated_at: now.toISOString(),
        is_synced: false
      };

      localStorage.setItem(storageKey, JSON.stringify(updatedTimesheet));
      return { data: updatedTimesheet, error: null };
      
    } catch (error) {
      console.error('Error in local clock out:', error);
      return { data: null, error };
    }
  }

  // Get all local timesheets that need to be synced
  getUnsyncedTimesheets() {
    const timesheets = [];
    const today = new Date().toISOString().split('T')[0];
    
    // Loop through all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('timesheet_') && key.includes(today)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          timesheets.push(data);
        } catch (e) {
          console.error('Error parsing timesheet data:', e);
        }
      }
    }
    
    return timesheets;
  }

  // Sync local timesheets to server
  async syncTimesheets() {
    return withSessionRetry(async () => {
      console.log('🔄 Starting timesheet synchronization...');
      const unsynced = this.getUnsyncedTimesheets().filter(t => !t.is_synced);
      const results = [];
      
      if (unsynced.length === 0) {
        console.log('✅ No unsynced timesheets found');
        return results;
      }
      
      console.log(`📋 Found ${unsynced.length} timesheets to sync`);
      
      for (const timesheet of unsynced) {
        try {
          // Convert hours to minutes for the database
          const workDurationMinutes = timesheet.total_hours 
            ? Math.round(parseFloat(timesheet.total_hours) * 60) 
            : null;
          
          // Prepare the data in the correct format for the database
          const dbTimesheet = {
            id: timesheet.id.startsWith('local_') ? undefined : timesheet.id, // Let DB generate UUID for local records
            employee_id: timesheet.employee_id,
            clock_in_time: timesheet.clock_in_time,
            clock_out_time: timesheet.clock_out_time,
            work_duration_minutes: workDurationMinutes,
            session_date: timesheet.session_date,
            status: timesheet.status,
            notes: timesheet.notes || '',
            created_at: timesheet.created_at,
            updated_at: new Date().toISOString()
          };

          // Sync to server
          const { data: syncedTimesheet, error: syncError } = await supabase
            .from('employee_timesheets')
            .upsert([dbTimesheet], {
              onConflict: 'id',
              ignoreDuplicates: false
            })
            .select()
            .single();

          if (syncError) throw syncError;

          // Update local storage with synced status and server-generated ID
          const updatedTimesheet = {
            ...timesheet,
            id: syncedTimesheet.id, // Use server-generated ID
            is_synced: true,
            updated_at: new Date().toISOString()
          };

          const storageKey = this.getLocalStorageKey(timesheet.employee_id || timesheet.employee_name);
          localStorage.setItem(storageKey, JSON.stringify(updatedTimesheet));
          
          console.log(`✅ Synced timesheet ${timesheet.id} → ${syncedTimesheet.id}`);
          results.push({ 
            id: timesheet.id, 
            success: true, 
            serverId: syncedTimesheet.id 
          });
          
        } catch (error) {
          console.error(`❌ Error syncing timesheet ${timesheet.id}:`, error);
          results.push({ 
            id: timesheet.id, 
            success: false, 
            error: error.message || 'Unknown error during sync'
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      console.log(`📊 Sync completed: ${successCount} succeeded, ${failureCount} failed`);
      return results;
    }, 'Timesheet synchronization');
  }

  // FIXED: Enhanced getAllTimesheets with proper sync detection and real-time updates
  async getAllTimesheets(limit = 50) {
    return withSessionRetry(async () => {
      console.log('📋 Loading all timesheets with enhanced sync detection...');
      console.log(`   • Limit: ${limit} records`);
      console.log('   • Using comprehensive data integrity checks');
      
      // Step 1: Get all timesheet records with full profile data
      const { data, error } = await supabase
        ?.from('employee_timesheets')
        ?.select(`
          *,
          user_profiles!inner(
            id,
            full_name,
            email,
            role
          )
        `)
        ?.order('created_at', { ascending: false })
        ?.limit(limit);

      if (error) {
        console.error('❌ Database query failed:', error);
        throw error;
      }
      
      console.log(`✅ Query successful: ${data?.length || 0} timesheet records found`);
      
      // Step 2: Validate data integrity and detect sync issues
      if (data && data?.length > 0) {
        console.log('📊 Performing sync validation checks...');
        
        // Check for status distribution
        const statusCounts = data?.reduce((acc, record) => {
          const status = record?.status || 'unknown';
          acc[status] = (acc?.[status] || 0) + 1;
          return acc;
        }, {});
        console.log('   • Status breakdown:', statusCounts);
        
        // Check for today's records
        const todayRecords = data?.filter(r => 
          r?.session_date === new Date()?.toISOString()?.split('T')?.[0]
        );
        console.log(`   • Records for today: ${todayRecords?.length}`);
        
        // Check for active sessions (clocked in today)
        const activeTodayRecords = todayRecords?.filter(r => r?.status === 'clocked_in');
        console.log(`   • Currently active (clocked in today): ${activeTodayRecords?.length}`);
        
        // Check for orphaned records (records without valid user profiles)
        const orphanedRecords = data?.filter(r => !r?.user_profiles || !r?.user_profiles?.id);
        console.log(`   • Orphaned records detected: ${orphanedRecords?.length}`);
        
        // Check for incomplete records 
        const incompleteRecords = data?.filter(r => 
          r?.status === 'clocked_in' && r?.clock_out_time !== null ||
          r?.status === 'clocked_out' && r?.clock_out_time === null
        );
        console.log(`   • Status/timestamp mismatches: ${incompleteRecords?.length}`);
        
        // Log detailed active employee information
        if (activeTodayRecords?.length > 0) {
          console.log('👥 Currently active employees:');
          activeTodayRecords?.forEach((record, index) => {
            const employee = record?.user_profiles;
            const clockInTime = record?.clock_in_time ? new Date(record.clock_in_time)?.toLocaleTimeString() : 'Unknown';
            console.log(`   ${index + 1}. ${employee?.full_name} (${employee?.email}) - clocked in at ${clockInTime}`);
          });
        }
        
        // Auto-cleanup orphaned records in background
        if (orphanedRecords?.length > 0) {
          console.warn(`⚠️ Found ${orphanedRecords?.length} orphaned records - running background cleanup`);
          this.cleanupOrphanedRecordsImmediate(orphanedRecords);
        }
        
        // Auto-fix status mismatches
        if (incompleteRecords?.length > 0) {
          console.warn(`⚠️ Found ${incompleteRecords?.length} status/timestamp mismatches - fixing automatically`);
          this.fixIncompleteRecords(incompleteRecords);
        }
        
      } else {
        console.log('📊 No timesheet records in database. This could indicate:');
        console.log('   1. No employees have clocked in/out yet');
        console.log('   2. All records were cleaned up');
        console.log('   3. RLS policies might be restricting access');
        console.log('   4. Database connection issues');
      }
      
      return data || [];
    }, 'Get all timesheets');
  }

  // NEW: Immediate cleanup for orphaned records (more aggressive)
  async cleanupOrphanedRecordsImmediate(orphanedRecords) {
    try {
      if (!orphanedRecords || orphanedRecords?.length === 0) return;
      
      console.log('🧹 Performing immediate orphan cleanup...');
      
      const orphanedIds = orphanedRecords?.map(record => record?.id)?.filter(Boolean);
      
      if (orphanedIds?.length > 0) {
        const { error: deleteError } = await supabase
          ?.from('employee_timesheets')
          ?.delete()
          ?.in('id', orphanedIds);

        if (deleteError) {
          console.error('Failed to delete orphaned records:', deleteError);
        } else {
          console.log(`✅ Immediate cleanup: ${orphanedIds?.length} orphaned records removed`);
        }
      }
    } catch (error) {
      console.error('Immediate cleanup error:', error);
    }
  }

  // NEW: Fix incomplete records (status/timestamp mismatches)
  async fixIncompleteRecords(incompleteRecords) {
    try {
      if (!incompleteRecords || incompleteRecords?.length === 0) return;
      
      console.log('🔧 Fixing incomplete timesheet records...');
      
      for (const record of incompleteRecords) {
        try {
          let updates = {};
          
          // Fix clocked_in status with clock_out_time set
          if (record?.status === 'clocked_in' && record?.clock_out_time !== null) {
            updates = { status: 'clocked_out' };
            console.log(`   • Fixed record ${record?.id}: status set to clocked_out`);
          }
          
          // Fix clocked_out status without clock_out_time
          if (record?.status === 'clocked_out' && record?.clock_out_time === null) {
            updates = { 
              clock_out_time: new Date()?.toISOString(),
              status: 'clocked_out'
            };
            console.log(`   • Fixed record ${record?.id}: added missing clock_out_time`);
          }
          
          if (Object.keys(updates)?.length > 0) {
            const { error: updateError } = await supabase
              ?.from('employee_timesheets')
              ?.update(updates)
              ?.eq('id', record?.id);
              
            if (updateError) {
              console.error(`Failed to fix record ${record?.id}:`, updateError);
            }
          }
        } catch (recordError) {
          console.error(`Error fixing individual record ${record?.id}:`, recordError);
        }
      }
      
      console.log('✅ Incomplete records fix completed');
    } catch (error) {
      console.error('Fix incomplete records error:', error);
    }
  }

  // Get timesheets by date range for admin reporting
  async getTimesheetsByDateRange(startDate, endDate, employeeId = null) {
    return withSessionRetry(async () => {
      let query = supabase
        ?.from('employee_timesheets')
        ?.select(`
          *,
          user_profiles!inner(
            id,
            full_name,
            email,
            role
          )
        `)
        ?.gte('session_date', startDate)
        ?.lte('session_date', endDate)
        ?.order('session_date', { ascending: false });

      // Filter by specific employee if provided
      if (employeeId) {
        query = query?.eq('employee_id', employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }, 'Get timesheets by date range');
  }

  // FIXED: Enhanced active employees with comprehensive sync validation
  async getActiveEmployees() {
    return withSessionRetry(async () => {
      const todayDate = new Date()?.toISOString()?.split('T')?.[0];
      
      console.log('👥 Loading active employees with comprehensive validation...');
      console.log(`   • Date filter: ${todayDate}`);
      console.log('   • Status filter: clocked_in');
      console.log('   • Performing real-time data integrity checks');
      
      // Step 1: Get all active timesheet records for today
      const { data, error } = await supabase
        ?.from('employee_timesheets')
        ?.select(`
          *,
          user_profiles!inner(
            id,
            full_name,
            email,
            role
          )
        `)
        ?.eq('session_date', todayDate)
        ?.eq('status', 'clocked_in')
        ?.order('clock_in_time', { ascending: false });

      if (error) {
        console.error('❌ Active employees query failed:', error);
        throw error;
      }
      
      console.log(`✅ Active employees query successful: ${data?.length || 0} records found`);
      
      // Step 2: Validate and clean the results
      let validActiveEmployees = [];
      let invalidRecords = [];
      
      if (data && data?.length > 0) {
        console.log('📊 Validating active employee records...');
        
        for (const record of data) {
          // Validate record integrity
          const isValid = (
            (record?.user_profiles && 
            record?.user_profiles?.id &&
            record?.user_profiles?.full_name &&
            record?.clock_in_time &&
            record?.status === 'clocked_in' && !record?.clock_out_time)  // Should not have clock_out_time if still active
          );
          
          if (isValid) {
            validActiveEmployees?.push(record);
          } else {
            invalidRecords?.push(record);
            console.warn(`   • Invalid record found: ${record?.id} - ${record?.user_profiles?.full_name || 'Unknown'}`);
          }
        }
        
        console.log(`   • Valid active employees: ${validActiveEmployees?.length}`);
        console.log(`   • Invalid records detected: ${invalidRecords?.length}`);
        
        // Display active employee details
        if (validActiveEmployees?.length > 0) {
          console.log('📊 Currently active employees (validated):');
          validActiveEmployees?.forEach((record, index) => {
            const employee = record?.user_profiles;
            const clockInTime = new Date(record?.clock_in_time)?.toLocaleTimeString();
            const duration = Math.floor((Date.now() - new Date(record?.clock_in_time)) / (1000 * 60));
            console.log(`   ${index + 1}. ${employee?.full_name} (${employee?.role}) - in for ${duration} min (since ${clockInTime})`);
          });
        } else {
          console.log('📊 No valid active employees found. Possible reasons:');
          console.log('   1. All employees have clocked out');
          console.log('   2. No employees clocked in today');
          console.log('   3. Data integrity issues fixed automatically');
        }
        
        // Auto-fix invalid records
        if (invalidRecords?.length > 0) {
          console.warn(`🔧 Auto-fixing ${invalidRecords?.length} invalid active records...`);
          await this.fixInvalidActiveRecords(invalidRecords);
        }
        
      } else {
        console.log('📊 No active employee records found for today');
      }
      
      // Return only validated results
      return validActiveEmployees;
    }, 'Get active employees');
  }

  // NEW: Fix invalid active records
  async fixInvalidActiveRecords(invalidRecords) {
    try {
      for (const record of invalidRecords) {
        try {
          let shouldDelete = false;
          let updates = {};
          
          // Check if record has no valid user profile - delete it
          if (!record?.user_profiles || !record?.user_profiles?.id) {
            shouldDelete = true;
          }
          // Check if record is marked active but has clock_out_time - fix status
          else if (record?.clock_out_time && record?.status === 'clocked_in') {
            updates = { status: 'clocked_out' };
          }
          // Check if record has invalid timestamps
          else if (!record?.clock_in_time && record?.status === 'clocked_in') {
            shouldDelete = true; // Invalid record
          }
          
          if (shouldDelete) {
            const { error: deleteError } = await supabase
              ?.from('employee_timesheets')
              ?.delete()
              ?.eq('id', record?.id);
              
            if (deleteError) {
              console.error(`Failed to delete invalid record ${record?.id}:`, deleteError);
            } else {
              console.log(`   • Deleted invalid record: ${record?.id}`);
            }
          } else if (Object.keys(updates)?.length > 0) {
            const { error: updateError } = await supabase
              ?.from('employee_timesheets')
              ?.update(updates)
              ?.eq('id', record?.id);
              
            if (updateError) {
              console.error(`Failed to update invalid record ${record?.id}:`, updateError);
            } else {
              console.log(`   • Fixed record status: ${record?.id} - ${record?.user_profiles?.full_name}`);
            }
          }
        } catch (recordError) {
          console.error(`Error processing invalid record ${record?.id}:`, recordError);
        }
      }
      
      console.log('✅ Invalid active records processing completed');
    } catch (error) {
      console.error('Fix invalid active records error:', error);
    }
  }

  // ENHANCED: Background cleanup with better detection
  async cleanupOrphanedRecordsBackground() {
    try {
      // Run this in background without blocking the main query
      setTimeout(async () => {
        console.log('🧹 Running enhanced background cleanup...');
        
        // Get all timesheet records that don't have valid employee references
        const { data: orphanedRecords, error: orphanError } = await supabase
          ?.from('employee_timesheets')
          ?.select(`
            id,
            employee_id,
            session_date,
            status,
            created_at,
            user_profiles(id)
          `)
          ?.is('user_profiles.id', null); // Records without valid user_profiles reference

        if (orphanError) {
          console.warn('Background cleanup query failed:', orphanError);
          return;
        }

        if (orphanedRecords?.length > 0) {
          console.log(`🗑️ Found ${orphanedRecords?.length} orphaned records in background cleanup`);
          
          const orphanedIds = orphanedRecords?.map(record => record?.id);
          
          const { error: deleteError } = await supabase
            ?.from('employee_timesheets')
            ?.delete()
            ?.in('id', orphanedIds);

          if (deleteError) {
            console.warn('Background cleanup deletion failed:', deleteError);
          } else {
            console.log(`✅ Background cleanup completed: ${orphanedIds?.length} orphaned records removed`);
          }
        } else {
          console.log('✅ Background cleanup: No orphaned records found');
        }
        
        // Also clean up stale active sessions (clocked in for more than 24 hours)
        await this.cleanupStaleActiveSessions();
        
      }, 2000); // Run after 2 seconds to not block main queries
    } catch (error) {
      console.warn('Background cleanup error:', error);
    }
  }

  // NEW: Clean up stale active sessions
  async cleanupStaleActiveSessions() {
    try {
      const yesterdayDate = new Date();
      yesterdayDate?.setDate(yesterdayDate?.getDate() - 1);
      const cutoffDate = yesterdayDate?.toISOString()?.split('T')?.[0];
      
      console.log('🕒 Cleaning up stale active sessions...');
      
      const { data: staleRecords, error: findError } = await supabase
        ?.from('employee_timesheets')
        ?.select('id, employee_id, session_date, status, clock_in_time')
        ?.eq('status', 'clocked_in')
        ?.lt('session_date', cutoffDate);

      if (findError) {
        console.warn('Failed to find stale sessions:', findError);
        return;
      }

      if (staleRecords?.length > 0) {
        console.log(`🔄 Found ${staleRecords?.length} stale active sessions to fix`);
        
        // Auto-close stale sessions
        const { error: updateError } = await supabase
          ?.from('employee_timesheets')
          ?.update({
            status: 'clocked_out',
            clock_out_time: new Date()?.toISOString(),
            notes: 'Auto-closed stale session by system cleanup'
          })
          ?.in('id', staleRecords?.map(r => r?.id));

        if (updateError) {
          console.warn('Failed to auto-close stale sessions:', updateError);
        } else {
          console.log(`✅ Auto-closed ${staleRecords?.length} stale active sessions`);
        }
      } else {
        console.log('✅ No stale active sessions found');
      }
    } catch (error) {
      console.error('Stale session cleanup error:', error);
    }
  }

  // Get employee work summary for admin reporting
  async getEmployeeWorkSummary(employeeId, startDate, endDate) {
    return withSessionRetry(async () => {
      const { data, error } = await supabase
        ?.from('employee_timesheets')
        ?.select('*')
        ?.eq('employee_id', employeeId)
        ?.gte('session_date', startDate)
        ?.lte('session_date', endDate)
        ?.not('work_duration_minutes', 'is', null) // Only completed shifts
        ?.order('session_date', { ascending: false });

      if (error) throw error;

      // Calculate summary statistics
      const timesheets = data || [];
      const totalMinutes = timesheets?.reduce((sum, record) => sum + (record?.work_duration_minutes || 0), 0);
      const totalHours = Math.round(totalMinutes / 60 * 100) / 100;
      const totalDays = timesheets?.length;
      const avgHoursPerDay = totalDays > 0 ? Math.round(totalHours / totalDays * 100) / 100 : 0;

      return {
        timesheets,
        summary: {
          totalMinutes,
          totalHours,
          totalDays,
          avgHoursPerDay,
          periodStart: startDate,
          periodEnd: endDate
        }
      };
    }, 'Get employee work summary');
  }

  // Enhanced manual cleanup method with better orphan detection
  async performManualCleanup() {
    return withSessionRetry(async () => {
      console.log('🔧 Starting comprehensive manual database cleanup...');
      
      // Step 1: Get all valid user profile IDs
      const { data: validUsers, error: userError } = await supabase
        ?.from('user_profiles')
        ?.select('id');

      if (userError) {
        console.error('Failed to load valid users:', userError);
        throw userError;
      }

      const validUserIds = validUsers?.map(user => user?.id) || [];
      console.log(`📋 Found ${validUserIds?.length} valid user profiles`);

      if (validUserIds?.length === 0) {
        console.log('⚠️ No valid user profiles found - skipping cleanup');
        return {
          orphanedRecords: { cleaned: false, recordsRemoved: 0 },
          oldRecords: { cleaned: false, recordsRemoved: 0 },
          staleActiveRecords: { cleaned: false, recordsRemoved: 0 },
          message: 'No valid user profiles found - cleanup skipped',
          summary: { totalRecordsProcessed: 0, validUserProfiles: 0, orphanedRemoved: 0, oldRecordsRemoved: 0, staleActiveRemoved: 0 }
        };
      }

      // Step 2: Find and delete orphaned records using a more reliable method
      console.log('🔍 Detecting orphaned timesheet records...');
      
      // Get all timesheet records
      const { data: allTimesheets, error: timesheetError } = await supabase
        ?.from('employee_timesheets')
        ?.select('id, employee_id, session_date, status, clock_in_time, created_at');

      if (timesheetError) {
        console.error('Failed to load timesheets:', timesheetError);
        throw timesheetError;
      }

      // Filter orphaned records in JavaScript (more reliable than complex SQL)
      const orphanedRecords = allTimesheets?.filter(timesheet => 
        !validUserIds?.includes(timesheet?.employee_id)
      ) || [];

      console.log(`🔍 Found ${orphanedRecords?.length} orphaned timesheet records`);

      let orphanedDeleted = 0;
      let oldRecordsDeleted = 0;
      let staleActiveDeleted = 0;

      // Step 3: Delete orphaned records if any found
      if (orphanedRecords?.length > 0) {
        const orphanedIds = orphanedRecords?.map(record => record?.id);
        
        console.log('🗑️ Removing orphaned records:', orphanedIds?.slice(0, 3), '...');
        
        const { data: deletedOrphaned, error: deleteOrphanedError } = await supabase
          ?.from('employee_timesheets')
          ?.delete()
          ?.in('id', orphanedIds)
          ?.select('id');

        if (deleteOrphanedError) {
          console.error('Failed to delete orphaned records:', deleteOrphanedError);
          throw deleteOrphanedError;
        } else {
          orphanedDeleted = deletedOrphaned?.length || 0;
          console.log(`✅ Deleted ${orphanedDeleted} orphaned timesheet records`);
        }
      }

      // Step 4: Clean up stale "clocked_in" records from previous days
      const yesterday = new Date();
      yesterday?.setDate(yesterday?.getDate() - 1);
      const yesterdayDate = yesterday?.toISOString()?.split('T')?.[0];

      console.log(`🕒 Cleaning up stale active records from before ${yesterdayDate}...`);

      const { data: deletedStale, error: deleteStaleError } = await supabase
        ?.from('employee_timesheets')
        ?.update({
          status: 'clocked_out',
          clock_out_time: new Date()?.toISOString(),
          notes: 'Auto-closed stale session'
        })
        ?.eq('status', 'clocked_in')
        ?.lt('session_date', yesterdayDate)
        ?.select('id');

      if (deleteStaleError) {
        console.warn('Could not clean stale active records:', deleteStaleError?.message);
      } else {
        staleActiveDeleted = deletedStale?.length || 0;
        console.log(`🔄 Auto-closed ${staleActiveDeleted} stale active sessions`);
      }

      // Step 5: Clean up old completed records (older than 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo?.setDate(ninetyDaysAgo?.getDate() - 90);
      const cutoffDate = ninetyDaysAgo?.toISOString()?.split('T')?.[0];

      const { data: deletedOld, error: deleteOldError } = await supabase
        ?.from('employee_timesheets')
        ?.delete()
        ?.eq('status', 'clocked_out')
        ?.lt('session_date', cutoffDate)
        ?.select('id');

      if (deleteOldError) {
        console.warn('Could not delete old records:', deleteOldError?.message);
      } else {
        oldRecordsDeleted = deletedOld?.length || 0;
        console.log(`🗑️ Deleted ${oldRecordsDeleted} old completed records`);
      }

      const result = {
        orphanedRecords: {
          cleaned: true,
          recordsRemoved: orphanedDeleted,
          details: orphanedRecords?.slice(0, 5) // Show first 5 for reference
        },
        staleActiveRecords: {
          cleaned: !deleteStaleError,
          recordsRemoved: staleActiveDeleted
        },
        oldRecords: {
          cleaned: !deleteOldError,
          recordsRemoved: oldRecordsDeleted
        },
        message: `Cleanup completed: ${orphanedDeleted} orphaned + ${staleActiveDeleted} stale active + ${oldRecordsDeleted} old records processed`,
        summary: {
          totalRecordsProcessed: orphanedDeleted + staleActiveDeleted + oldRecordsDeleted,
          validUserProfiles: validUserIds?.length,
          orphanedRemoved: orphanedDeleted,
          staleActiveRemoved: staleActiveDeleted,
          oldRecordsRemoved: oldRecordsDeleted
        }
      };

      console.log('✅ Comprehensive manual cleanup completed:', result?.summary);
      return result;
    }, 'Manual cleanup operation');
  }

  // Diagnostic method to identify sync issues
  async diagnoseSyncIssues() {
    return withSessionRetry(async () => {
      console.log('🔍 Running timesheet sync diagnostics...');
      
      const todayDate = new Date()?.toISOString()?.split('T')?.[0];
      
      // Get all timesheet records for today
      const { data: allTodayTimesheets, error: timesheetError } = await supabase
        ?.from('employee_timesheets')
        ?.select('id, employee_id, status, clock_in_time')
        ?.eq('session_date', todayDate);

      if (timesheetError) throw timesheetError;

      // Get all valid employees
      const { data: validEmployees, error: employeeError } = await supabase
        ?.from('user_profiles')
        ?.select('id, full_name, email');

      if (employeeError) throw employeeError;

      const validEmployeeIds = validEmployees?.map(emp => emp?.id) || [];
      
      // Analyze timesheet records
      const activeTimesheets = allTodayTimesheets?.filter(t => t?.status === 'clocked_in') || [];
      const orphanedActiveTimesheets = activeTimesheets?.filter(t => !validEmployeeIds?.includes(t?.employee_id)) || [];
      const validActiveTimesheets = activeTimesheets?.filter(t => validEmployeeIds?.includes(t?.employee_id)) || [];

      const diagnosis = {
        todayDate,
        totalTimesheetsToday: allTodayTimesheets?.length || 0,
        activeTimesheetsTotal: activeTimesheets?.length || 0,
        orphanedActiveTimesheets: orphanedActiveTimesheets?.length || 0,
        validActiveTimesheets: validActiveTimesheets?.length || 0,
        validEmployeeCount: validEmployees?.length || 0,
        orphanedRecords: orphanedActiveTimesheets?.map(t => ({
          id: t?.id,
          employee_id: t?.employee_id,
          clock_in_time: t?.clock_in_time
        })),
        validActiveEmployees: validActiveTimesheets?.map(t => {
          const employee = validEmployees?.find(emp => emp?.id === t?.employee_id);
          return {
            timesheet_id: t?.id,
            employee_name: employee?.full_name || 'Unknown',
            employee_email: employee?.email || 'Unknown',
            clock_in_time: t?.clock_in_time
          };
        }),
        recommendedAction: orphanedActiveTimesheets?.length > 0 ? 'RUN_CLEANUP' : 'NO_ACTION_NEEDED'
      };

      console.log('📊 Sync diagnosis completed:', diagnosis);
      return diagnosis;
    }, 'Sync diagnosis operation');
  }
}

export const timesheetService = new TimesheetService();