import React, { useState, useEffect } from 'react';
import Header from '../../components/ui/Header';
import Icon from '../../components/AppIcon';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { XCircle } from 'lucide-react';

import { supabase, handleSupabaseError, withSessionRetry } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService } from '../../services/timesheetService';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const OperationsOverviewDashboard = () => {
  const { user, sessionError, sessionInfo, autoSaveStatus, clearSessionError, retryAutoSave } = useAuth();
  const [activeSection, setActiveSection] = useState('sales');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editingInventory, setEditingInventory] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [selectedTimeFrame, setSelectedTimeFrame] = useState('today');

  // Timesheet filter state - simplified
  const [timesheetFilters, setTimesheetFilters] = useState({
    startDate: '',
    endDate: '', 
    selectedEmployee: '',
    isFiltered: false
  });
  const [filteredTimesheets, setFilteredTimesheets] = useState([]);
  const [payrollSummary, setPayrollSummary] = useState({
    totalHours: 0,
    totalMinutes: 0,
    totalDays: 0,
    employeeName: ''
  });

  // Sales data
  const salesData = [
    { time: '9:00', sales: 450, orders: 12 },
    { time: '10:00', sales: 680, orders: 18 },
    { time: '11:00', sales: 820, orders: 22 },
    { time: '12:00', sales: 950, orders: 25 },
    { time: '13:00', sales: 1120, orders: 28 },
    { time: '14:00', sales: 890, orders: 24 },
    { time: '15:00', sales: 750, orders: 20 },
    { time: '16:00', sales: 650, orders: 17 }
  ];

  // Navigation sections - add timesheet section
  const navSections = [
    { id: 'sales', label: 'SALES', icon: 'TrendingUp' },
    { id: 'timesheets', label: 'Timesheets', icon: 'Clock' },
    { id: 'inventory', label: 'Inventory', icon: 'Package' },
    { id: 'employees', label: 'Employees', icon: 'Users' },
    { id: 'settings', label: 'Settings', icon: 'Settings' }
  ];

  // Enhanced error handling utility - updated to use centralized handler
  const handleSupabaseError_OLD = (error, context) => {
    console.error(`${context}:`, error);
    
    if (error?.code === 'PGRST303' && error?.message?.includes('JWT expired')) {
      setAuthError('Your session has expired. Please refresh the page or log in again.');
      return 'Session expired. Please refresh the page.';
    }
    
    if (error?.message?.includes('Failed to fetch') || 
        error?.message?.includes('AuthRetryableFetchError')) {
      return 'Cannot connect to the server. Please check your connection.';
    }
    
    return error?.message || 'An unexpected error occurred.';
  };

  // Enhanced session refresh utility - use centralized utility
  const refreshSession = async () => {
    try {
      const { data, error } = await supabase?.auth?.refreshSession();
      if (error) throw error;
      
      setAuthError('');
      return true;
    } catch (error) {
      console.error('Session refresh failed:', error);
      setAuthError('Unable to refresh session. Please log in again.');
      return false;
    }
  };

  // Updated database operation wrapper - use centralized withSessionRetry
  const withRetry = withSessionRetry;

  // Removed performDataCleanup prompt and logic for cleaner UX

  // Load data on mount - add timesheet loading with real-time sync
  useEffect(() => {
    loadEmployees();
    loadInventory();
    loadTimesheets(); // This will now set up real-time sync
    // Removed loadActiveEmployees and periodic refresh for performance
    // Set up periodic refresh for active employees (every 30 seconds)
    // const activeEmployeeRefresh = setInterval(() => {
    //   loadActiveEmployees();
    // }, 30000);
    
    // Cleanup on unmount
    return () => {
      // clearInterval(activeEmployeeRefresh);
      // Real-time subscription cleanup handled in setupTimesheetRealTimeSync
    };
  }, []);

  // Enhanced filtered timesheet loading with better error handling
  const loadFilteredTimesheets = async () => {
    try {
      setLoading(true);
      setAuthError('');
      
      const { startDate, endDate, selectedEmployee } = timesheetFilters;
      
      // Validate date range
      if (!startDate || !endDate) {
        alert('Please select both start and end dates');
        return;
      }
      
      if (new Date(startDate) > new Date(endDate)) {
        alert('Start date cannot be after end date');
        return;
      }

      let data;
      let summary;
      
      console.log(`🔍 Filtering timesheets: ${startDate} to ${endDate}, Employee: ${selectedEmployee || 'All'}`);
      
      if (selectedEmployee) {
        // Get specific employee work summary with detailed timesheets
        const result = await withRetry(async () => {
          return await timesheetService?.getEmployeeWorkSummary(selectedEmployee, startDate, endDate);
        }, 'Loading filtered employee timesheets');
        
        data = result?.timesheets || [];
        summary = result?.summary || {};
        
        // Get employee name
        const selectedEmp = employees?.find(emp => emp?.id === selectedEmployee);
        setPayrollSummary({
          totalHours: summary?.totalHours || 0,
          totalMinutes: summary?.totalMinutes || 0,
          totalDays: summary?.totalDays || 0,
          employeeName: selectedEmp?.full_name || 'Unknown Employee'
        });
      } else {
        // Get all employees timesheets for date range
        data = await withRetry(async () => {
          return await timesheetService?.getTimesheetsByDateRange(startDate, endDate);
        }, 'Loading filtered timesheets');
        
        // Calculate total hours for all employees
        const totalMinutes = data?.reduce((sum, record) => sum + (record?.work_duration_minutes || 0), 0) || 0;
        setPayrollSummary({
          totalHours: Math.round(totalMinutes / 60 * 100) / 100,
          totalMinutes: totalMinutes,
          totalDays: data?.length || 0,
          employeeName: 'All Employees'
        });
      }

      setFilteredTimesheets(data || []);
      setTimesheetFilters(prev => ({ ...prev, isFiltered: true }));
      console.log(`✅ Loaded ${data?.length || 0} filtered timesheets with ${payrollSummary?.totalHours || 0} total hours`);
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error loading filtered timesheets');
      alert(`Failed to load filtered timesheets: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset timesheet filters
  const resetTimesheetFilters = () => {
    setTimesheetFilters({
      startDate: '',
      endDate: '',
      selectedEmployee: '',
      isFiltered: false
    });
    setFilteredTimesheets([]);
    setPayrollSummary({
      totalHours: 0,
      totalMinutes: 0,
      totalDays: 0,
      employeeName: ''
    });
    loadTimesheets(); // Reload original data
  };

  // Get employee options for dropdown
  const getEmployeeOptions = () => {
    return [
      { value: '', label: 'All Employees' },
      ...(employees?.map(emp => ({
        value: emp?.id,
        label: emp?.full_name,
        description: emp?.role
      })) || [])
    ];
  };

  // Enhanced timesheet loading - updated with centralized error handling
  const loadTimesheets = async () => {
    try {
      setAuthError('');
      console.log('🔍 Starting timesheet loading with enhanced debugging...');
      
      let data = await withSessionRetry(async () => {
        return await timesheetService?.getAllTimesheets(100);
      }, 'Loading timesheets');

      setTimesheets(data || []);
      console.log(`✅ Timesheets loaded successfully: ${data?.length || 0} records`);
      
      // Enhanced debugging for empty results
      if (!data || data?.length === 0) {
        console.log('📊 DEBUG: No timesheet records found. Possible reasons:');
        console.log('   • No employees have clocked in/out yet');
        console.log('   • All timesheet records were cleaned up');
        console.log('   • RLS policies may be restricting access');
        console.log('   • Database connection issues');
        
        // Check if we have employees but no timesheets
        if (employees?.length > 0) {
          console.log(`   • Found ${employees?.length} employees but 0 timesheets`);
          console.log('   • Employees need to use POS terminal to clock in/out');
        }
      }
      
      // Set up real-time subscription for live updates
      setupTimesheetRealTimeSync();
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error loading timesheets');
      setAuthError(errorMessage);
      console.error('❌ Timesheet loading failed:', errorMessage);
    }
  };

  // Add real-time timesheet sync
  const setupTimesheetRealTimeSync = () => {
    try {
      // Subscribe to timesheet changes
      const subscription = supabase
        ?.channel('timesheet_sync')
        ?.on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'employee_timesheets'
          },
          (payload) => {
            console.log('🔄 Real-time timesheet change detected:', payload?.eventType, payload?.new || payload?.old);
            
            // Reload timesheets and active employees on any change
            loadTimesheets();
            // loadActiveEmployees(); // Removed as per user request
          }
        )
        ?.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Real-time timesheet sync established');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Real-time timesheet sync failed');
          }
        });

      // Cleanup subscription on component unmount
      return () => {
        if (subscription) {
          subscription?.unsubscribe();
        }
      };
    } catch (error) {
      console.error('Error setting up timesheet sync:', error);
    }
  };

  // Helper function to format duration
  const formatDuration = (minutes) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Helper function to format time
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp)?.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Load employees - updated with centralized error handling
  const loadEmployees = async () => {
    try {
      setAuthError('');
      let data = await withSessionRetry(async () => {
        const { data, error } = await supabase?.from('user_profiles')?.select('*')?.order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      }, 'Loading employees');

      setEmployees(data || []);
      console.log(`Loaded ${data?.length || 0} employees from database`);
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error loading employees');
      setAuthError(errorMessage);
      console.error('Employee loading failed:', errorMessage);
    }
  };

  const loadInventory = async () => {
    try {
      setLoading(true);
      setAuthError('');
      
      let data = await withSessionRetry(async () => {
        const { data, error } = await supabase
          ?.from('master_inventory_items')
          ?.select('id, item_name, price, created_at')
          ?.order('item_name');
        if (error) throw error;
        return data;
      }, 'Loading inventory');
      const transformedInventory = (data || [])?.map(item => ({
        id: item?.id,
        item_name: item?.item_name,
        price: Number(item?.price || 0),
        created_at: item?.created_at
      }));
      setInventory(transformedInventory);
      console.log(`Loaded ${transformedInventory?.length || 0} master inventory items from admin dashboard`);
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error loading inventory');
      setAuthError(errorMessage);
      console.error('Inventory loading failed:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const saveEmployee = async (employee) => {
    setLoading(true);
    try {
      setAuthError('');
      // Validate input data before sending to server
      if (!employee?.email?.trim() || !employee?.full_name?.trim()) {
        throw new Error('Email and full name are required');
      }

      // Basic email format validation
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern?.test(employee?.email?.trim())) {
        throw new Error('Please enter a valid email address');
      }

      await withRetry(async () => {
        if (employee?.id) {
          // Update existing employee using admin_update_employee function
          const { data, error } = await supabase?.rpc('admin_update_employee', {
            employee_id: employee?.id,
            employee_name: employee?.full_name?.trim(),
            employee_email: employee?.email?.trim(),
            employee_role: employee?.role || 'employee'
          });
          if (error) throw error;
        } else {
          // Create new employee using admin_create_employee function with validation
          const { data, error } = await supabase?.rpc('admin_create_employee', {
            employee_email: employee?.email?.trim(),
            employee_name: employee?.full_name?.trim(),
            employee_role: employee?.role || 'employee'
          });
          if (error) throw error;
        }
      }, 'Saving employee');

      await loadEmployees();
      setEditingEmployee(null);
      
      // Show success message
      alert(`Employee ${employee?.id ? 'updated' : 'created'} successfully!`);
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error saving employee');
      
      // Show user-friendly error messages based on error type
      let displayMessage = 'Failed to save employee. ';
      
      if (error?.message?.includes('already exists')) {
        displayMessage += 'An employee with this email address already exists.';
      } else if (error?.message?.includes('Invalid email')) {
        displayMessage += 'Please enter a valid email address.';
      } else if (error?.message?.includes('Invalid role')) {
        displayMessage += 'Please select a valid role.';
      } else if (error?.message?.includes('Name cannot be empty')) {
        displayMessage += 'Employee name is required.';
      } else if (error?.message?.includes('constraint violation')) {
        displayMessage += 'Database error occurred. Please contact administrator.';
      } else {
        displayMessage += errorMessage;
      }
      
      alert(displayMessage);
    } finally {
      setLoading(false);
    }
  };

  const deleteEmployee = async (employeeId) => {
    if (!window.confirm('Are you sure you want to delete this employee? This will also remove their timesheet and POS session data.')) return;

    setLoading(true);
    try {
      setAuthError('');
      await withRetry(async () => {
        const { data, error } = await supabase?.rpc('admin_delete_employee', {
          employee_id_in: employeeId
        });
        if (error) throw error;
      }, 'Deleting employee');
      
      await loadEmployees();
      alert('Employee deleted successfully!');
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error deleting employee');
      
      let displayMessage = 'Failed to delete employee. ';
      
      if (error?.message?.includes('not found')) {
        displayMessage += 'Employee not found.';
      } else if (error?.message?.includes('has related records')) {
        displayMessage += 'Cannot delete employee with active records. Please contact administrator.';
      } else {
        displayMessage += errorMessage;
      }
      
      alert(displayMessage);
    } finally {
      setLoading(false);
    }
  };

  const saveInventoryItem = async (item) => {
    setLoading(true);
    try {
      setAuthError('');
      if (!item?.item_name?.trim()) {
        throw new Error('Item name is required');
      }
      if (!item?.price || isNaN(parseFloat(item?.price)) || parseFloat(item?.price) <= 0) {
        throw new Error('Valid price is required');
      }
      const itemData = {
        item_name: item?.item_name?.trim(),
        price: parseFloat(item?.price)
      };
      await withRetry(async () => {
        if (item?.id) {
          const { error } = await supabase
            ?.from('master_inventory_items')
            ?.update(itemData)
            ?.eq('id', item?.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            ?.from('master_inventory_items')
            ?.insert([itemData]);
          if (error) throw error;
        }
      }, 'Saving inventory item');
      await loadInventory();
      setEditingInventory(null);
      alert(`Master inventory item ${item?.id ? 'updated' : 'created'} successfully! This item will now be available for employee POS sessions.`);
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error saving inventory item');
      let displayMessage = 'Failed to save inventory item. ';
      if (error?.message?.includes('duplicate key')) {
        displayMessage += 'An item with this name already exists.';
      } else if (error?.message?.includes('check constraint')) {
        displayMessage += 'Please check that all values are valid.';
      } else {
        displayMessage += errorMessage;
      }
      alert(displayMessage);
    } finally {
      setLoading(false);
    }
  };

  const deleteInventoryItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this inventory item? This will affect all future POS sessions.')) return;
    setLoading(true);
    try {
      setAuthError('');
      await withRetry(async () => {
        const { error } = await supabase
          ?.from('master_inventory_items')
          ?.delete()
          ?.eq('id', itemId);
        if (error) throw error;
      }, 'Deleting inventory item');
      await loadInventory();
      alert('Master inventory item deleted successfully!');
    } catch (error) {
      const errorMessage = handleSupabaseError(error, 'Error deleting inventory item');
      alert(`Failed to delete inventory item: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const updateAdminPassword = () => {
    if (!newPassword || !confirmPassword) {
      setPasswordMessage('Please fill in both password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage('Passwords do not match');
      return;
    }

    if (newPassword?.length < 4) {
      setPasswordMessage('Password must be at least 4 characters');
      return;
    }

    // In a real app, this would update the database
    // For now, we'll just show success message
    setPasswordMessage('Password updated successfully! (Note: This demo uses hardcoded authentication)');
    setNewPassword('');
    setConfirmPassword('');

    setTimeout(() => setPasswordMessage(''), 3000);
  };

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Updated session expiry warning component - enhanced with session info
  const SessionWarning = () => {
    if (!authError && !sessionError) return null;
    
    const displayError = sessionError || authError;
    
    return (
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg max-w-md">
          <div className="flex items-center space-x-2">
            <Icon name="AlertTriangle" size={20} className="text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">Session Issue</p>
              <p className="text-xs text-red-600 mt-1">{displayError}</p>
              
              {/* Show session info for debugging */}
              {sessionInfo && Object.keys(sessionInfo)?.length > 0 && (
                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  <p><strong>Status:</strong> {sessionInfo?.status}</p>
                  {sessionInfo?.remainingMinutes !== undefined && (
                    <p><strong>Expires in:</strong> {sessionInfo?.remainingMinutes} min</p>
                  )}
                  {sessionInfo?.nearExpiry && (
                    <p className="text-orange-600"><strong>⚠️ Session expiring soon</strong></p>
                  )}
                </div>
              )}
              
              <div className="flex space-x-2 mt-3">
                <button
                  onClick={() => window.location?.reload()}
                  className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded font-medium"
                >
                  Refresh Page
                </button>
                <button
                  onClick={() => {
                    setAuthError('');
                    clearSessionError?.();
                  }}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded"
                >
                  Dismiss
                </button>
                {sessionInfo?.status === 'Active' && sessionInfo?.nearExpiry && (
                  <button
                    onClick={async () => {
                      try {
                        await refreshSession();
                        setAuthError('');
                        clearSessionError?.();
                      } catch (error) {
                        console.error('Manual refresh failed:', error);
                      }
                    }}
                    className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1 rounded font-medium"
                  >
                    Refresh Session
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSalesSection = () => (
    <div id="sales" className="mb-12 scroll-mt-20">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-6">
          <Icon name="TrendingUp" size={24} className="text-blue-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-800">Sales Overview</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">Today's Revenue</h3>
            <p className="text-3xl font-bold">$2,847.50</p>
            <p className="text-blue-200 mt-2">+12.5% from yesterday</p>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">Total Orders</h3>
            <p className="text-3xl font-bold">158</p>
            <p className="text-green-200 mt-2">+8 from yesterday</p>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">Average Order</h3>
            <p className="text-3xl font-bold">$18.02</p>
            <p className="text-purple-200 mt-2">+2.3% from yesterday</p>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  // Enhanced timesheet section renderer - simplified with focus on data and simple date filter
  const renderTimesheetsSection = () => (
    <div id="timesheets" className="mb-12 scroll-mt-20">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Icon name="Clock" size={24} className="text-purple-600 mr-3" />
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Employee Timesheets</h2>
              <p className="text-sm text-gray-600 mt-1">Monitor employee work hours and attendance</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={loadTimesheets}
              className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
              disabled={loading}
            >
              <Icon name="RefreshCw" size={16} className="mr-2" />
              Refresh
            </button>
            {/* Active Employees section removed as per user request */}
          </div>
        </div>

        {/* Simple Date Filter Section */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center mb-3">
            <Icon name="Filter" size={18} className="text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-800">Date Filter</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={timesheetFilters?.startDate}
              onChange={(e) => setTimesheetFilters(prev => ({ ...prev, startDate: e?.target?.value }))}
              disabled={loading}
            />
            <Input
              label="End Date"
              type="date"
              value={timesheetFilters?.endDate}
              onChange={(e) => setTimesheetFilters(prev => ({ ...prev, endDate: e?.target?.value }))}
              disabled={loading}
            />
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={timesheetFilters.selectedEmployee}
              onChange={e => setTimesheetFilters(prev => ({ ...prev, selectedEmployee: e.target.value }))}
              disabled={loading}
            >
              <option value="">All Employees</option>
              {employees
                ?.filter(emp => emp.role === 'employee')
                ?.filter(emp => {
                  const name = emp.full_name?.toLowerCase() || '';
                  return !name.includes('admin') && !name.includes('manager');
                })
                .map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
            </select>
            <div className="flex flex-col justify-end">
              <Button
                onClick={loadFilteredTimesheets}
                disabled={loading || !timesheetFilters?.startDate || !timesheetFilters?.endDate}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Icon name="Search" size={16} className="mr-2" />
                {loading ? 'Loading...' : 'Filter'}
              </Button>
            </div>
            <div className="flex flex-col justify-end">
              <Button
                variant="outline"
                onClick={resetTimesheetFilters}
                disabled={loading}
                className="text-gray-600"
              >
                <Icon name="X" size={16} className="mr-2" />
                Clear
              </Button>
            </div>
          </div>

          {/* Simple Summary */}
          {timesheetFilters?.isFiltered && payrollSummary?.totalHours > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="bg-white p-2 rounded-lg">
                  <p className="text-xs text-gray-600">Total Hours</p>
                  <p className="text-lg font-bold text-blue-800">{payrollSummary?.totalHours}h</p>
                </div>
                <div className="bg-white p-2 rounded-lg">
                  <p className="text-xs text-gray-600">Work Days</p>
                  <p className="text-lg font-bold text-blue-800">{payrollSummary?.totalDays}</p>
                </div>
                <div className="bg-white p-2 rounded-lg">
                  <p className="text-xs text-gray-600">Employee</p>
                  <p className="text-lg font-bold text-blue-800">{payrollSummary?.employeeName}</p>
                </div>
              </div>
            </div>
          )}

          {timesheetFilters?.isFiltered && filteredTimesheets?.length === 0 && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-yellow-800 text-sm">No records found for selected date range</p>
            </div>
          )}
        </div>

        {/* Timesheet Data Display */}
        {timesheetFilters?.isFiltered ? (
          /* Filtered Results */
          (<div className="max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <Icon name="Filter" size={18} className="mr-2 text-purple-600" />
              Filtered Results ({filteredTimesheets?.length})
            </h3>
            {filteredTimesheets?.length > 0 && (
              <div className="space-y-3">
                {filteredTimesheets?.map((timesheet) => (
                  <div key={timesheet?.id} className="p-4 rounded-lg border bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-semibold text-gray-800">{timesheet?.user_profiles?.full_name || timesheet?.full_name}</h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            timesheet?.status === 'clocked_in' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {timesheet?.status?.replace('_', ' ')?.toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                          <span>Date: {new Date(timesheet?.session_date)?.toLocaleDateString()}</span>
                          <span>Clock-in: {formatTime(timesheet?.clock_in_time)}</span>
                          <span>Clock-out: {formatTime(timesheet?.clock_out_time)}</span>
                          <span className="font-semibold text-blue-700">
                            Duration: {formatDuration(timesheet?.work_duration_minutes)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>)
        ) : (
          /* Default View */
          (<>
            {/* Active Employees section removed as per user request */}
            {/* Recent Records */}
            <div className="max-h-96 overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <Icon name="History" size={18} className="mr-2 text-purple-600" />
                Recent Records
              </h3>
              
              {timesheets?.length === 0 ? (
                <div className="text-center py-8">
                  <Icon name="Clock" size={48} className="mx-auto mb-4 text-gray-300" />
                  <h4 className="text-lg font-semibold text-gray-700 mb-2">No Timesheet Records Found</h4>
                  <p className="text-gray-500 mb-4">To see timesheet data, employees need to clock in/out using the POS terminal</p>
                  <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h5 className="font-semibold text-blue-800 mb-2">📋 How to Generate Timesheet Data:</h5>
                    <ol className="list-decimal list-inside space-y-1 text-left max-w-md mx-auto">
                      <li>Go to Employee POS Terminal</li>
                      <li>Select an employee from dropdown</li>
                      <li>Click "Clock In" to start shift</li>
                      <li>Later click "Clock Out" to end shift</li>
                      <li>Data will appear here automatically</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {timesheets
                    ?.filter(ts => !timesheetFilters.selectedEmployee || ts.employee_id === timesheetFilters.selectedEmployee)
                    .map((timesheet) => (
                    <div key={timesheet?.id} className={`p-4 rounded-lg border ${
                      timesheet?.status === 'clocked_in' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="font-semibold text-gray-800">{timesheet?.user_profiles?.full_name}</h4>
                            <span className="text-sm text-gray-500">{timesheet?.user_profiles?.role}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <span>Date: {new Date(timesheet?.session_date)?.toLocaleDateString()}</span>
                            <span>Clock-in: {formatTime(timesheet?.clock_in_time)}</span>
                            <span>Clock-out: {formatTime(timesheet?.clock_out_time)}</span>
                            <span>Duration: {formatDuration(timesheet?.work_duration_minutes)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)
        )}

        {/* Statistics */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">
              {timesheetFilters?.isFiltered ? 'Filtered Hours' : 'Today\'s Hours'}
            </h3>
            <p className="text-3xl font-bold">
              {timesheetFilters?.isFiltered 
                ? `${payrollSummary?.totalHours || 0}h`
                : formatDuration(
                    timesheets
                      ?.filter(t => t?.session_date === new Date()?.toISOString()?.split('T')?.[0])
                      ?.reduce((sum, t) => sum + (t?.work_duration_minutes || 0), 0)
                  )
              }
            </p>
            <p className="text-purple-200 mt-2">
              {timesheetFilters?.isFiltered ? 'Selected period' : 'Completed shifts'}
            </p>
          </div>
          {/* Active Now section removed as per user request */}
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">Total Records</h3>
            <p className="text-3xl font-bold">{timesheets?.length}</p>
            <p className="text-green-200 mt-2">All timesheet entries</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInventorySection = () => (
    <div id="inventory" className="mb-12 scroll-mt-20">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Icon name="Package" size={24} className="text-green-600 mr-3" />
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Master Inventory Management</h2>
              <p className="text-sm text-gray-600 mt-1">Manage inventory items available to all employee POS terminals</p>
            </div>
          </div>
          <Button
            onClick={() => setEditingInventory({ 
              item_name: '', 
              price: '', 
              created_at: new Date()?.toISOString()
            })}
            className="bg-green-600 hover:bg-green-700"
            disabled={loading}
          >
            <Icon name="Plus" size={16} className="mr-2" />
            Add Master Item
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <div className="grid gap-4">
            {inventory?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Icon name="Package" size={48} className="mx-auto mb-4 opacity-50" />
                <p>No master inventory items found. Add items that employees can use in POS sessions.</p>
              </div>
            ) : (
              inventory?.map((item) => (
                <div key={item?.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{item?.item_name}</h3>
                    <div className="text-sm text-gray-600 grid grid-cols-2 gap-4 mt-2">
                      <span>Price: ${Number(item?.price)?.toFixed(2)}</span>
                      <span>Created: {new Date(item?.created_at)?.toLocaleDateString()}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                        Master Template Item - Available for Employee POS
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingInventory(item)}
                      disabled={loading}
                    >
                      <Icon name="Edit" size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteInventoryItem(item?.id)}
                      className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                      disabled={loading}
                    >
                      <Icon name="Trash2" size={16} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {editingInventory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">
                {editingInventory?.id ? 'Edit' : 'Add'} Master Inventory Item
              </h3>
              <div className="space-y-4">
                <Input
                  label="Item Name *"
                  value={editingInventory?.item_name || ''}
                  onChange={(e) => setEditingInventory({
                    ...editingInventory,
                    item_name: e?.target?.value
                  })}
                  placeholder="e.g., Downy 19 oz"
                  disabled={loading}
                />
                <Input
                  label="Price (USD) *"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingInventory?.price || ''}
                  onChange={(e) => setEditingInventory({
                    ...editingInventory,
                    price: e?.target?.value
                  })}
                  placeholder="0.00"
                  disabled={loading}
                />
                <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-lg">
                  <Icon name="Info" size={14} className="inline mr-1" />
                  Master inventory items serve as templates for employee POS sessions. Changes will apply to future POS sessions.
                </div>
              </div>
              <div className="flex space-x-3 mt-6">
                <Button
                  onClick={() => saveInventoryItem(editingInventory)}
                  disabled={loading || !editingInventory?.item_name?.trim() || !editingInventory?.price}
                  className="flex-1"
                >
                  {loading ? 'Saving...' : 'Save Master Item'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingInventory(null)}
                  className="flex-1"
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderEmployeeSection = () => (
    <div id="employees" className="mb-12 scroll-mt-20">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Icon name="Users" size={24} className="text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Employee Management</h2>
          </div>
          <Button
            onClick={() => setEditingEmployee({ full_name: '', email: '', role: 'employee' })}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={loading}
          >
            <Icon name="Plus" size={16} className="mr-2" />
            Add Employee
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <div className="grid gap-4">
            {employees?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Icon name="Users" size={48} className="mx-auto mb-4 opacity-50" />
                <p>No employees found. Add your first employee to get started.</p>
              </div>
            ) : (
              employees?.map((employee) => (
                <div key={employee?.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{employee?.full_name}</h3>
                    <div className="text-sm text-gray-600 grid grid-cols-2 gap-4 mt-2">
                      <span>Email: {employee?.email}</span>
                      <span>Role: <span className="capitalize">{employee?.role}</span></span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Created: {new Date(employee?.created_at)?.toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingEmployee(employee)}
                      disabled={loading}
                    >
                      <Icon name="Edit" size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteEmployee(employee?.id)}
                      className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                      disabled={loading}
                    >
                      <Icon name="Trash2" size={16} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {editingEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">
                {editingEmployee?.id ? 'Edit' : 'Add'} Employee
              </h3>
              <div className="space-y-4">
                <Input
                  label="Full Name *"
                  value={editingEmployee?.full_name || ''}
                  onChange={(e) => setEditingEmployee({
                    ...editingEmployee,
                    full_name: e?.target?.value
                  })}
                  placeholder="Enter employee's full name"
                  disabled={loading}
                />
                <Input
                  label="Email Address *"
                  type="email"
                  value={editingEmployee?.email || ''}
                  onChange={(e) => setEditingEmployee({
                    ...editingEmployee,
                    email: e?.target?.value
                  })}
                  placeholder="employee@company.com"
                  disabled={loading}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <select
                    value={editingEmployee?.role || 'employee'}
                    onChange={(e) => setEditingEmployee({
                      ...editingEmployee,
                      role: e?.target?.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    disabled={loading}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="text-xs text-gray-500">
                  * Required fields
                </div>
              </div>
              <div className="flex space-x-3 mt-6">
                <Button
                  onClick={() => saveEmployee(editingEmployee)}
                  disabled={loading || !editingEmployee?.full_name?.trim() || !editingEmployee?.email?.trim()}
                  className="flex-1"
                >
                  {loading ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingEmployee(null)}
                  className="flex-1"
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderSettingsSection = () => (
    <div id="settings" className="mb-12 scroll-mt-20">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-6">
          <Icon name="Settings" size={24} className="text-gray-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-800">Admin Settings</h2>
        </div>

        <div className="max-w-md">
          <h3 className="text-lg font-semibold mb-4">Update Admin Password</h3>
          <div className="space-y-4">
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e?.target?.value)}
              placeholder="Enter new password"
            />
            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e?.target?.value)}
              placeholder="Confirm new password"
            />
            <Button
              onClick={updateAdminPassword}
              className="w-full bg-gray-800 hover:bg-gray-900"
            >
              Update Password
            </Button>
            {passwordMessage && (
              <div className={`p-3 rounded-lg text-sm ${
                passwordMessage?.includes('successfully') 
                  ? 'bg-green-50 text-green-700 border border-green-200' :'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {passwordMessage}
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">Current Password Info</h4>
            <p className="text-sm text-blue-700">
              Current admin password: <code className="bg-blue-100 px-2 py-1 rounded">admin</code>
            </p>
            <p className="text-xs text-blue-600 mt-2">
              This is a demo system. In production, passwords would be properly encrypted and stored securely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Excel-style session view state
  const [excelDate, setExcelDate] = useState(() => {
    // Default to today in YYYY-MM-DD
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [excelSessions, setExcelSessions] = useState([]); // all sessions for the date
  const [excelSession, setExcelSession] = useState(null); // selected session
  const [excelInventory, setExcelInventory] = useState([]);
  const [excelLoading, setExcelLoading] = useState(false);

  // Fetch all sessions for the selected date
  useEffect(() => {
    const fetchSession = async () => {
      setExcelLoading(true);
      try {
        // Fetch all sessions for the selected date
        console.log('Querying pos_sessions for date:', excelDate);
        const { data: sessions, error } = await supabase
          .from('pos_sessions')
          .select(`id, created_at, employee_id, notes, cash_started, cash_added, cash_total, inventory_total, wash_dry_total, grand_total, user_profiles (full_name), pos_wash_dry_tickets (*)`)
          .eq('session_date', excelDate);
        if (error) throw error;
        console.log('All pos_sessions returned for date', excelDate, ':', sessions);
        setExcelSessions(sessions || []);
        // Default to first session if available
        const defaultSession = sessions && sessions.length > 0 ? sessions[0] : null;
        setExcelSession(defaultSession);
      } catch (e) {
        setExcelSessions([]);
        setExcelSession(null);
      } finally {
        setExcelLoading(false);
      }
    };
    fetchSession();
  }, [excelDate]);

  // Fetch inventory for selected session
  useEffect(() => {
    const fetchInventory = async () => {
      if (!excelSession) {
        setExcelInventory([]);
        return;
      }
      try {
        const { data: inventory, error: invError } = await supabase
          .from('pos_inventory_items')
          .select('*')
          .eq('pos_session_id', excelSession.id);
        if (invError) throw invError;
        setExcelInventory(inventory || []);
        console.log('Fetched inventory items for session', excelSession.id, ':', inventory);
      } catch (e) {
        setExcelInventory([]);
      }
    };
    fetchInventory();
  }, [excelSession]);

  // Excel-style session view component
  const renderExcelSessionView = () => {
    return (
      <div className="mb-10 bg-white rounded-2xl shadow-xl p-8 print:p-2 border border-gray-200">
        {/* Modern Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-1 bg-blue-600 rounded-full mr-3"></div>
            <h2 className="text-2xl font-bold text-blue-800">Daily Sheet Preview</h2>
            <span className="ml-4 px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-sm border border-blue-200">
              {excelDate} | {excelSession?.user_profiles?.full_name || 'N/A'}
            </span>
          </div>
          {/* Export to Excel button remains here */}
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold text-sm shadow"
            onClick={() => {
              import('xlsx').then(XLSX => {
                // Combine duplicate items as in the table
                const combined = {};
                (excelInventory || []).forEach(item => {
                  const key = item.item_name;
                  if (!combined[key]) {
                    combined[key] = { ...item };
                  } else {
                    combined[key].start_count = (combined[key].start_count || 0) + (item.start_count || 0);
                    combined[key].add_count = (combined[key].add_count || 0) + (item.add_count || 0);
                    combined[key].sold_count = (combined[key].sold_count || 0) + (item.sold_count || 0);
                    combined[key].left_count = (combined[key].left_count || 0) + (item.left_count || 0);
                    combined[key].total_amount = (combined[key].total_amount || 0) + (item.total_amount || 0);
                    combined[key].price = (combined[key].price || 0) + (item.price || 0);
                  }
                });
                const exportData = Object.values(combined).map(item => ({
                  ITEM: item.item_name,
                  QTY: item.quantity || '',
                  PRICE: item.price ? Number(item.price).toFixed(2) : '',
                  START: item.start_count || '',
                  ADD: item.add_count || '',
                  SOLD: item.sold_count || '',
                  LEFT: item.left_count || '',
                  TOTAL: item.total_amount ? Number(item.total_amount).toFixed(2) : ''
                }));
                // Header row: Date | Employee
                const header = [[
                  `Date: ${excelDate} | Employee: ${excelSession?.user_profiles?.full_name || 'N/A'}`
                ]];
                // Inventory table header
                const inventoryHeader = [[
                  'ITEM', 'QTY', 'PRICE', 'START', 'ADD', 'SOLD', 'LEFT', 'TOTAL'
                ]];
                // Inventory rows
                const inventoryRows = exportData.map(row => [
                  row.ITEM, row.QTY, row.PRICE, row.START, row.ADD, row.SOLD, row.LEFT, row.TOTAL
                ]);
                // Blank row
                const blank = [''];
                // Cash summary rows
                const cashRows = [
                  ['Cash Started', excelSession?.cash_started ? Number(excelSession.cash_started).toFixed(2) : ''],
                  ['Cash Added', excelSession?.cash_added ? Number(excelSession.cash_added).toFixed(2) : ''],
                  ['Total Cash', excelSession?.cash_total ? Number(excelSession.cash_total).toFixed(2) : ''],
                  ['Inventory Total', excelSession?.inventory_total ? Number(excelSession.inventory_total).toFixed(2) : ''],
                  ['Wash & Dry Total', excelSession?.wash_dry_total ? Number(excelSession.wash_dry_total).toFixed(2) : ''],
                  ['Grand Total', excelSession?.grand_total ? Number(excelSession.grand_total).toFixed(2) : '']
                ];
                // Combine all rows
                const wsData = [
                  ...header,
                  ...inventoryHeader,
                  ...inventoryRows,
                  blank,
                  ...cashRows
                ];
                const ws = XLSX.utils.aoa_to_sheet(wsData);
                // Merge header row
                ws['!merges'] = [
                  { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }
                ];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Sheet');
                XLSX.writeFile(wb, `laundryking-session-${excelDate}.xlsx`);
              });
            }}
          >
            Export to Excel
          </button>
          {excelSession && (
            <div className="text-lg font-bold text-gray-700">Employee: {excelSession.user_profiles?.full_name || 'N/A'}</div>
          )}
        </div>
        {/* Session selection dropdown if multiple sessions exist */}
        {excelSessions && excelSessions.length > 1 && (
          <div className="mb-4 flex items-center space-x-2">
            <label className="font-semibold text-gray-700">Select Session:</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              value={excelSession?.id || ''}
              onChange={e => {
                const selected = excelSessions.find(s => s.id === e.target.value);
                setExcelSession(selected);
              }}
            >
              {excelSessions.map(session => (
                <option key={session.id} value={session.id}>
                  {session.user_profiles?.full_name || 'N/A'}
                  {session.created_at ? ` (${new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {excelLoading ? (
          <div className="text-center py-8 text-gray-500">Loading session data...</div>
        ) : !excelSession ? (
          <div className="text-center py-8 text-gray-500">No session data found for this date.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 text-xs print:text-sm">
              <thead>
                <tr className="bg-blue-50 text-blue-900">
                  <th className="border px-3 py-2 font-semibold">ITEM</th>
                  <th className="border px-3 py-2 font-semibold">QTY</th>
                  <th className="border px-3 py-2 font-semibold">PRICE</th>
                  <th className="border px-3 py-2 font-semibold">START</th>
                  <th className="border px-3 py-2 font-semibold">ADD</th>
                  <th className="border px-3 py-2 font-semibold">SOLD</th>
                  <th className="border px-3 py-2 font-semibold">LEFT</th>
                  <th className="border px-3 py-2 font-semibold">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* Combine duplicate items by item_name for this session */}
                {(() => {
                  const combined = {};
                  (excelInventory || []).forEach(item => {
                    const key = item.item_name;
                    if (!combined[key]) {
                      combined[key] = { ...item };
                    } else {
                      // Only sum numeric fields except quantity (QTY) and price
                      combined[key].start_count = (combined[key].start_count || 0) + (item.start_count || 0);
                      combined[key].add_count = (combined[key].add_count || 0) + (item.add_count || 0);
                      combined[key].sold_count = (combined[key].sold_count || 0) + (item.sold_count || 0);
                      combined[key].left_count = (combined[key].left_count || 0) + (item.left_count || 0);
                      combined[key].total_amount = (combined[key].total_amount || 0) + (item.total_amount || 0);
                      // Do NOT sum price or quantity; keep the first occurrence
                    }
                  });
                  return Object.values(combined).map((item, idx) => (
                    <tr key={item.id + '-' + item.item_name}
                        className={idx % 2 === 0 ? 'bg-gray-50 hover:bg-blue-50 transition' : 'bg-white hover:bg-blue-50 transition'}>
                      <td className="border px-3 py-2 font-medium text-gray-800">{item.item_name}</td>
                      <td className="border px-3 py-2 text-center">{item.quantity || ''}</td>
                      <td className="border px-3 py-2 text-right">{item.price ? Number(item.price).toFixed(2) : ''}</td>
                      <td className="border px-3 py-2 text-right">{item.start_count || ''}</td>
                      <td className="border px-3 py-2 text-right">{item.add_count || ''}</td>
                      <td className="border px-3 py-2 text-right">{item.sold_count || ''}</td>
                      <td className="border px-3 py-2 text-right">{item.left_count || ''}</td>
                      <td className="border px-3 py-2 text-right font-semibold text-blue-700">{item.total_amount ? Number(item.total_amount).toFixed(2) : ''}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-8 mt-6">
              {/* Modern Cash Summary Card */}
              <div className="bg-blue-50 rounded-lg shadow p-4 min-w-[220px] border border-blue-200">
                <h3 className="text-lg font-bold text-blue-800 mb-2">Cash Summary</h3>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="py-1 font-semibold text-gray-700">Cash Started</td><td className="py-1 text-right">{excelSession.cash_started ? Number(excelSession.cash_started).toFixed(2) : ''}</td></tr>
                    <tr><td className="py-1 font-semibold text-gray-700">Cash Added</td><td className="py-1 text-right">{excelSession.cash_added ? Number(excelSession.cash_added).toFixed(2) : ''}</td></tr>
                    <tr><td className="py-1 font-semibold text-gray-700">Total Cash</td><td className="py-1 text-right">{excelSession.cash_total ? Number(excelSession.cash_total).toFixed(2) : ''}</td></tr>
                    <tr><td className="py-1 font-semibold text-gray-700">Inventory Total</td><td className="py-1 text-right">{excelSession.inventory_total ? Number(excelSession.inventory_total).toFixed(2) : ''}</td></tr>
                    <tr><td className="py-1 font-semibold text-gray-700">Wash &amp; Dry Total</td><td className="py-1 text-right">{excelSession.wash_dry_total ? Number(excelSession.wash_dry_total).toFixed(2) : ''}</td></tr>
                    <tr><td className="py-1 font-bold text-blue-800">Grand Total</td><td className="py-1 text-right font-bold text-blue-800">{excelSession.grand_total ? Number(excelSession.grand_total).toFixed(2) : ''}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="flex-1 flex gap-8">
                <div className="flex-1">
                  <table className="border border-gray-300 mt-2 min-w-[320px]">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-2 py-1">Ticket #</th>
                        <th className="border px-2 py-1">$Wash</th>
                        <th className="border px-2 py-1">$Dry</th>
                        <th className="border px-2 py-1">$Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(excelSession.pos_wash_dry_tickets || []).map(ticket => (
                        <tr key={ticket.id}>
                          <td className="border px-2 py-1">{ticket.ticket_number}</td>
                          <td className="border px-2 py-1">{ticket.wash_amount ? Number(ticket.wash_amount).toFixed(2) : ''}</td>
                          <td className="border px-2 py-1">{ticket.dry_amount ? Number(ticket.dry_amount).toFixed(2) : ''}</td>
                          <td className="border px-2 py-1">{ticket.total_amount ? Number(ticket.total_amount).toFixed(2) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Session Notes Box */}
                <div className="w-80 min-w-[220px] bg-yellow-50 border border-yellow-200 rounded-lg p-4 h-fit self-start">
                  <div className="font-semibold mb-1 text-yellow-900">Session Notes:</div>
                  <div className="whitespace-pre-line text-yellow-800">{excelSession?.notes?.trim() ? excelSession.notes : 'No notes for this session.'}</div>
                </div>
              </div>
            </div>
            <div className="mt-6 font-bold text-right text-lg">GRAND TOTAL: ${excelSession.grand_total ? Number(excelSession.grand_total).toFixed(2) : ''}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {renderSalesSection()}
      {renderExcelSessionView()}
      {/* Enhanced Session Status Display */}
      {(sessionError || !autoSaveStatus?.enabled) && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex">
              <div className="flex-shrink-0">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {sessionError ? 'Session Error' : 'Auto-save Disabled'}
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{sessionError || autoSaveStatus?.lastError || 'Auto-save functionality is currently unavailable.'}</p>
                </div>
                <div className="mt-4 flex space-x-3">
                  <button
                    onClick={clearSessionError}
                    className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={retryAutoSave}
                    className="text-sm bg-red-800 text-white px-3 py-1 rounded hover:bg-red-900"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Session Info Debug Panel (only show if session info available and in development) */}
      {sessionInfo?.status && import.meta.env?.DEV && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-sm text-blue-800">
            <strong>Session Status:</strong> {sessionInfo?.status}
            {sessionInfo?.remainingMinutes !== undefined && (
              <span className="ml-2">
                | <strong>Time Remaining:</strong> {sessionInfo?.remainingMinutes} minutes
              </span>
            )}
            {sessionInfo?.nearExpiry && (
              <span className="ml-2 text-orange-600 font-semibold">⚠️ Near Expiry</span>
            )}
            {autoSaveStatus?.enabled && (
              <span className="ml-2 text-green-600">✅ Auto-save Active</span>
            )}
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Operations Overview</h1>
          <p className="text-gray-600 mt-2">Monitor your business performance and key metrics</p>
        </div>
        
        {/* Enhanced connection status indicator */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`h-3 w-3 rounded-full ${
              sessionError || !autoSaveStatus?.enabled 
                ? 'bg-red-500' :'bg-green-500'
            }`}></div>
            <span className="text-sm text-gray-600">
              {sessionError || !autoSaveStatus?.enabled ? 'Connection Issue' : 'Connected'}
            </span>
          </div>
          
          <select 
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={selectedTimeFrame}
            onChange={(e) => setSelectedTimeFrame(e?.target?.value)}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>
      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {renderTimesheetsSection()}
        {renderInventorySection()}
        {renderEmployeeSection()}
        {renderSettingsSection()}
      </main>
    </div>
  );
};

export default OperationsOverviewDashboard;