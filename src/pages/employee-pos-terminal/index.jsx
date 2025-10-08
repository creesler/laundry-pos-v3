import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/ui/Header';
import Icon from '../../components/AppIcon';
import InventoryGrid from './components/InventoryGrid.jsx';
import TicketHistory from './components/TicketHistory';
import TicketInput from './components/TicketInput';
import CashSection from './components/CashSection';
import TotalsSection from './components/TotalsSection';
import NotesSection from './components/NotesSection';
import Numpad from './components/Numpad';
import EmployeeSelect from './components/EmployeeSelect';
import SaveProgressButton from './components/SaveProgressButton';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService } from '../../services/timesheetService';
import { posService } from '../../services/posService';
import { supabase } from '../../lib/supabase';
import { localDB } from '../../services/localDB.jsx';
import { employeeService } from '../../services/employeeService';
import Modal from '../../components/ui/Modal';

// Function to test and initialize database connection
async function testDatabaseConnection() {
  try {
    // 1. Try to read from the table to check permissions
    const { data: existingItems, error: readError } = await supabase
      .from('pos_inventory_items')
      .select('*')
      .limit(5);
    
    if (readError) {
      return; // Silently fail if there's an error
    }
    
    // 2. If no items, try to insert test data (if we have write permissions)
    if (!existingItems || existingItems.length === 0) {
      // Following offline-first principle - no default test items
      const testItems = [];
      
      await supabase
        .from('pos_inventory_items')
        .insert(testItems)
        .select();
    }
    
  } catch (error) {
    // Silently handle any errors
  }
}

const EmployeePOSTerminal = () => {
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [activeClockIn, setActiveClockIn] = useState(null);
  const [isCheckingClockIn, setIsCheckingClockIn] = useState(true);
  const [isClockingOut, setIsClockingOut] = useState(false);
  const { user, userProfile } = useAuth();
  // Always store selectedEmployee as employee id
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date()?.toLocaleDateString('en-GB'));
  const [activeInput, setActiveInput] = useState(null);
  const [currentInputValue, setCurrentInputValue] = useState('');
  const [isInputMode, setIsInputMode] = useState(false);
  const [clockStatus, setClockStatus] = useState('clocked-out');
  const [clockTime, setClockTime] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showClockOutPrompt, setShowClockOutPrompt] = useState(false);
  const [error, setError] = useState(null);
  const [employeeList, setEmployeeList] = useState([]);
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  
  // Check for active clock-in on component mount
  useEffect(() => {
    const checkActiveClockIn = async () => {
      try {
        setIsCheckingClockIn(true);
        
        // Check localStorage for active timesheet
        const activeTimesheetStr = localStorage.getItem('active_timesheet');
        if (activeTimesheetStr) {
          const activeTimesheet = JSON.parse(activeTimesheetStr);
          
          // If there's no clock_out_time, the employee is still clocked in
          if (!activeTimesheet.clock_out_time) {
            setActiveClockIn(activeTimesheet);
            setClockStatus('clocked-in');
            setClockTime(new Date(activeTimesheet.clock_in_time));
            setShowClockOutPrompt(true);
            
            // Also restore the selected employee
            if (activeTimesheet.employee_id) {
              setSelectedEmployee(activeTimesheet.employee_id);
            }
          }
        }
      } catch (error) {
        console.error('Error checking active clock-in:', error);
      } finally {
        setIsCheckingClockIn(false);
      }
    };

    checkActiveClockIn();

    // Set up beforeunload event to handle page refresh/close
    const handleBeforeUnload = (e) => {
      if (activeClockIn) {
        e.preventDefault();
        e.returnValue = 'You have an active clock-in. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user?.id]);


  // Handle clock out prompt response
  const handleClockOutPrompt = async (shouldClockOut) => {
    if (shouldClockOut) {
      await handleClockOut();
    }
    setShowClockOutPrompt(false);
  }
  
  // Local state for inventory

  // Inventory data
  const [inventoryItems, setInventoryItems] = useState([
    {
      id: 1,
      name: 'Downy 19 oz',
      qty: 1,
      price: 5.50,
      start: 0,
      add: 0,
      sold: 0,
      left: 0,
      total: 0
    },
    {
      id: 2,
      name: 'Gain Sheets 15ct',
      qty: 1,
      price: 2.25,
      start: 0,
      add: 0,
      sold: 0,
      left: 0,
      total: 0
    },
    {
      id: 3,
      name: 'Roma 17 63 oz',
      qty: 1,
      price: 2.75,
      start: 0,
      add: 0,
      sold: 0,
      left: 0,
      total: 0
    },
    {
      id: 4,
      name: 'Xtra 56 oz',
      qty: 1,
      price: 5.50,
      start: 0,
      add: 0,
      sold: 0,
      left: 0,
      total: 0
    },
    {
      id: 5,
      name: 'Clorox 16 oz',
      qty: 1,
      price: 2.50,
      start: 0,
      add: 0,
      sold: 0,
      left: 0,
      total: 0
    }
  ]);

  // Current ticket input
  const [tickets, setTickets] = useState([
    { id: crypto.randomUUID(), ticketNumber: '', wash: 0, dry: 0, total: 0 }
  ]);

  // All stored tickets for history
  const [allStoredTickets, setAllStoredTickets] = useState([]);

  // Cash section data
  const [cashData, setCashData] = useState({
    started: 0,
    added: 0,
    coinsUsed: 0, // new field
    total: 0
  });

  // Totals data (all auto-calculated)
  const [totals, setTotals] = useState({
    inventorySalesTotal: 0,
    washDrySubtotal: 0,
    grandTotal: 0
  });

  const [notes, setNotes] = useState('');

  // Handle ticket field changes
  const handleFieldChange = (field, value, id) => {
    setTickets(prev => prev.map(ticket => {
      if (ticket.id === id) {
        let updatedTicket = { ...ticket };
        
        if (field === 'wash' || field === 'dry') {
          // Convert to number, default to previous value if invalid
          const numValue = !isNaN(parseFloat(value)) ? parseFloat(value) : (ticket[field] || 0);
          updatedTicket[field] = numValue;
          
          // Calculate total
          const wash = field === 'wash' ? numValue : (ticket.wash || 0);
          const dry = field === 'dry' ? numValue : (ticket.dry || 0);
          updatedTicket.total = Math.round((wash + dry) * 100) / 100; // Round to 2 decimal places
        } else {
          // For non-numeric fields (like ticketNumber)
          updatedTicket[field] = value;
        }
        
        return updatedTicket;
      }
      return ticket;
    }));
  };

  // Handle inserting a new ticket
  const handleInsertTicket = async () => {
    try {
      setLoading(true);

      // Validate current ticket
      const currentTicket = tickets[0];
      if (!currentTicket || !currentTicket.ticketNumber || !(currentTicket.wash > 0 || currentTicket.dry > 0)) {
        alert('Please enter ticket number and wash or dry amount');
        return;
      }

      // Check if ticket number already exists
      const existingTickets = await localDB.getAllTickets();
      const ticketExists = existingTickets.some(t => t.ticketNumber === currentTicket.ticketNumber);
      if (ticketExists) {
        alert('Ticket number already exists. Please use a different number.');
        return;
      }

      // Create new ticket with current session
      const newTicket = {
        ...currentTicket,
        id: crypto.randomUUID(),
        pos_session_id: currentSession?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Save to localDB
      await localDB.storeTickets([newTicket]);

      // Load all tickets again to ensure we have the latest
      const allTickets = await localDB.getAllTickets();
      const validTickets = allTickets.filter(ticket => 
        ticket.id !== 'message' &&
        ticket.pos_session_id === currentSession?.id && // Only show tickets for current session
        (ticket.ticketNumber || ticket.ticket_number) &&
        ((ticket.wash > 0 || ticket.dry > 0) ||
         (ticket.wash_amount > 0 || ticket.dry_amount > 0))
      ).sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA; // Most recent first
      });
      setAllStoredTickets(validTickets);

      // Reset input ticket
      setTickets([{
        id: crypto.randomUUID(),
        ticketNumber: '',
        wash: 0,
        dry: 0,
        total: 0
      }]);

      // Clear input state
      setActiveInput(null);
      setCurrentInputValue('');
      setIsInputMode(false);

      console.log('✅ Inserted new ticket:', newTicket);
      console.log('✅ Updated ticket history:', validTickets);
    } catch (error) {
      console.error('Error inserting ticket:', error);
      alert('Error saving ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Function to reset only SOLD and ADD fields for inventory items
  const resetInventoryTransactionFields = () => {
    setInventoryItems(prev => prev?.map(item => ({
      ...item,
      sold: 0,    // Reset SOLD field to 0
      add: 0,     // Reset ADD field to 0
      total: 0,   // Reset total as it depends on sold
      left: item?.start || 0  // Recalculate left stock based on start count only
    })));
    
    console.log('✅ Reset SOLD and ADD fields for all inventory items');
  }

  // Load employees from localDB only - following offline-first architecture
  const loadEmployees = async () => {
    try {
      setLoadingEmployees(true);
      
      // Only load from localDB - no fallbacks or online checks
      const localEmployees = await localDB.getAllEmployees();
      
      if (localEmployees?.length > 0) {
        setEmployeeList(localEmployees);
        console.log('✅ Loaded employees from localDB:', localEmployees.length);
        } else {
          setEmployeeList([]);
        console.log('💡 No employees in localDB. Click Save Progress to download.');
      }
      
    } catch (err) {
      console.error('Error loading employees:', err);
      setError('Error loading employees. Click Save Progress to download.');
      setEmployeeList([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Load master inventory items from local data only - strictly following offline-first principle
  const loadMasterInventoryItems = async () => {
    try {
      setLoading(true);
      
      // Get inventory items from localDB only - no fallback to default items
      const localInventory = await localDB.getAllInventoryItems();
      
      // Set inventory items from localDB, empty array if none found
      // This ensures we only show items that have been explicitly saved
      setInventoryItems(localInventory || []);
      console.log('✅ Loaded inventory items from localDB:', localInventory?.length || 0, 'items');
      
    } catch (error) {
      console.error('Error loading inventory items:', error);
      // Use fallback inventory on error
      setInventoryItems([
        { id: 1, name: 'Downy 19 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 2, name: 'Gain Sheets 15ct', qty: 1, price: 2.25, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 3, name: 'Roma 17 63 oz', qty: 1, price: 2.75, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 4, name: 'Xtra 56 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 5, name: 'Clorox 16 oz', qty: 1, price: 2.50, start: 0, add: 0, sold: 0, left: 0, total: 0 }
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Function to get initial data (no logging)
  const logInitialData = async () => {
    // This function is intentionally left empty to prevent any logging
    // All logging has been removed as per user request
  };

  // Handle real-time inventory item insertion
  const handleInventoryInsert = (newItem) => {
    if (!newItem) return;
    
    setInventoryItems(prev => {
      // Check if item already exists (prevent duplicates)
      const existingItem = prev?.find(item => item?.dbId === newItem?.id);
      if (existingItem) {
        console.log('Item already exists, skipping insert');
        return prev;
      }

      // Add new item to inventory with actual database values
      const newPosItem = {
        id: prev?.length + 1, // Sequential ID for POS
        dbId: newItem?.id, // Store database ID
        name: newItem?.item_name,
        qty: newItem?.quantity || 1,
        price: Number(newItem?.price || 0),
        start: newItem?.start_count || 0,     // ✅ FIXED: Use actual start_count
        add: newItem?.add_count || 0,         // ✅ FIXED: Use actual add_count
        sold: newItem?.sold_count || 0,       // ✅ FIXED: Use actual sold_count
        left: newItem?.left_count || 0,       // ✅ FIXED: Use actual left_count (current stock)
        total: Number(newItem?.total_amount || 0) // ✅ FIXED: Use actual total_amount
      };

      const updatedItems = [...prev, newPosItem];
      console.log(`✅ Added new inventory item with actual stock values: ${newItem?.item_name}`);
      
      // Show user notification
      if (selectedEmployee) {
        setTimeout(() => {
          alert(`📦 New inventory item added: ${newItem?.item_name} (Current Stock: ${newItem?.left_count || 0}, Price: $${Number(newItem?.price || 0)?.toFixed(2)})`);
        }, 500);
      }
      
      return updatedItems;
    });
  };

  // Handle real-time inventory item updates
  const handleInventoryUpdate = (updatedItem) => {
    if (!updatedItem) return;
    
    setInventoryItems(prev => {
      const updatedItems = prev?.map(item => {
        if (item?.dbId === updatedItem?.id) {
          // Update with actual database values while preserving any local POS session changes
          return {
            ...item,
            name: updatedItem?.item_name,
            qty: updatedItem?.quantity || 1,
            price: Number(updatedItem?.price || 0),
            // Update stock values with actual database values
            start: updatedItem?.start_count || 0,
            add: updatedItem?.add_count || 0,
            sold: updatedItem?.sold_count || 0,
            left: updatedItem?.left_count || 0,     // This is the critical "last recorded stock"
            total: Number(updatedItem?.total_amount || 0)
          };
        }
        return item;
      });

      console.log(`🔄 Updated inventory item with actual stock values: ${updatedItem?.item_name} (Current Stock: ${updatedItem?.left_count || 0})`);
      
      // Show user notification
      if (selectedEmployee) {
        setTimeout(() => {
          alert(`📝 Inventory item updated: ${updatedItem?.item_name} - Current Stock: ${updatedItem?.left_count || 0}`);
        }, 500);
      }
      
      return updatedItems;
    });
  };

  // Handle real-time inventory item deletion
  const handleInventoryDelete = (deletedItem) => {
    if (!deletedItem) return;
    
    setInventoryItems(prev => {
      const filteredItems = prev?.filter(item => item?.dbId !== deletedItem?.id);
      
      console.log(`🗑️ Removed inventory item: ${deletedItem?.item_name}`);
      
      // Show user notification
      if (selectedEmployee) {
        setTimeout(() => {
          alert(`🗑️ Inventory item removed: ${deletedItem?.item_name}`);
        }, 500);
      }
      
      return filteredItems;
    });
  };

  // No automatic data loading on mount - everything loads through Save Progress button

  // Only restore selected employee from localStorage on mount
  useEffect(() => {
    const savedEmployee = localStorage.getItem('selected_employee');
    if (savedEmployee) {
      setSelectedEmployee(savedEmployee);
    }
  }, []);

  // Restore notes from localDB on mount
  useEffect(() => {
    const loadSessionData = async () => {
      if (selectedEmployee) {
        const session = await localDB.getSessionByEmployeeAndDate(selectedEmployee, getTodayDate());
        if (session) {
          setNotes(session.notes || '');
          console.log('Restored notes from localDB:', session.notes);
        }
      }
    };
    loadSessionData();
  }, [selectedEmployee]);

  // Function to check if there are unsaved changes
  const hasUnsavedChanges = () => {
    // Check inventory for any non-zero values in editable fields
    const hasInventoryChanges = inventoryItems?.some(item => 
      (item?.start || 0) > 0 || 
      (item?.add || 0) > 0 || 
      (item?.sold || 0) > 0
    );

    // Check wash & dry tickets for any non-zero values
    const hasTicketChanges = tickets?.some(ticket => 
      (ticket?.wash || 0) > 0 || 
      (ticket?.dry || 0) > 0
    );

    // Check cash section for any non-zero values
    const hasCashChanges = (cashData?.started || 0) > 0 || (cashData?.added || 0) > 0;

    // Check notes for any content
    const hasNotesChanges = notes?.trim()?.length > 0;

    return hasInventoryChanges || hasTicketChanges || hasCashChanges || hasNotesChanges;
  };

  // Enhanced resetAllFields with improved ticket number generation
  const resetAllFields = async () => {
    // Reset inventory items to default zero values but reload from master items
    await loadMasterInventoryItems();

    // Enhanced: Generate new sequential tickets with guaranteed database sync
    try {
      let newTickets;
      
      // Always use the enhanced service method for proper sequencing
      const ticketNumbers = await posService?.generateTicketNumbers(3);
      newTickets = ticketNumbers?.map((ticketNum, index) => ({
        id: index + 1,
        ticketNumber: ticketNum,
        wash: 0,
        dry: 0,
        total: 0
      }));
      
      setTickets(newTickets);
      console.log(`✅ Generated fresh sequential tickets: ${ticketNumbers?.join(', ')}`);
    } catch (error) {
      console.error('Error generating sequential tickets:', error);
      
      // Enhanced fallback with better sequence detection
      try {
        // Get the current sequence status from database
        const sequenceStatus = await posService?.getTicketSequenceStatus();
        const currentNumber = sequenceStatus?.last_ticket_number || 0;
        
        setTickets([
          { id: 1, ticketNumber: String(currentNumber + 1)?.padStart(3, '0'), wash: 0, dry: 0, total: 0 },
          { id: 2, ticketNumber: String(currentNumber + 2)?.padStart(3, '0'), wash: 0, dry: 0, total: 0 },
          { id: 3, ticketNumber: String(currentNumber + 3)?.padStart(3, '0'), wash: 0, dry: 0, total: 0 }
        ]);
        
        console.log(`⚠️ Used fallback sequential numbering starting from: ${currentNumber + 1}`);
      } catch (fallbackError) {
        // Final fallback to timestamp-based numbers
        const timestamp = Date.now();
        setTickets([
          { id: 1, ticketNumber: String(timestamp)?.slice(-3), wash: 0, dry: 0, total: 0 },
          { id: 2, ticketNumber: String(timestamp + 1)?.slice(-3), wash: 0, dry: 0, total: 0 },
          { id: 3, ticketNumber: String(timestamp + 2)?.slice(-3), wash: 0, dry: 0, total: 0 }
        ]);
        
        console.warn('Used timestamp-based ticket numbers as final fallback');
      }
    }

    // Reset cash section
    setCashData({
      started: 0,
      added: 0,
      total: 0
    });

    // Reset notes
    setNotes('');

    // Clear any active input states
    setActiveInput(null);
    setCurrentInputValue('');
    setIsInputMode(false);
  };

  // Enhanced employee change handler with SOLD/ADD field reset logic
  const handleEmployeeChange = async (newEmployeeId) => {
    // If the selected employee is the same, do nothing
    if (newEmployeeId === selectedEmployee) return;

    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      const shouldSave = window.confirm(
        `You have unsaved changes for current employee. Would you like to save your progress before switching to another employee?`
      );

      if (shouldSave) {
        try {
          setLoading(true);
          await handleSave();
        } catch (error) {
          console.error('Error saving progress:', error);
          const proceedAnyway = window.confirm(
            'Failed to save progress. Do you want to continue switching employees anyway? Unsaved changes will be lost.'
          );
          if (!proceedAnyway) {
            setLoading(false);
            return; // Cancel the employee change
          }
        } finally {
          setLoading(false);
        }
      }
    }

    // Switch to new employee and reset only SOLD and ADD fields
    setSelectedEmployee(newEmployeeId);
    localStorage.setItem('selected_employee', newEmployeeId);
    const today = getTodayDate();
    await localDB.ready;
    const session = await localDB.getSessionByEmployeeAndDate(newEmployeeId, today);
    if (session) {
      setCurrentSession(session);
      // Set cash data and notes from existing session
      setCashData({
        started: session.cash_started || 0,
        added: session.cash_added || 0,
        coinsUsed: session.coins_used || 0,
        total: (session.cash_started || 0) + (session.cash_added || 0) - (session.coins_used || 0)
      });
      setNotes(session.notes || '');
      console.log('Loaded existing session data for employee and today:', session);
    } else {
      // Create new session for today
      const newSession = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() :
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          }),
        created_at: new Date().toISOString(),
        session_date: today,
        employee_id: newEmployeeId,
        status: 'active'
      };
      await localDB.storeSession(newSession);
      setCurrentSession(newSession);
      // Store session ID in localStorage to maintain consistency
      localStorage.setItem('current_session_id', newSession.id);
      console.log('Created new session for employee and today:', newSession);
    }

    try {
      // Get ALL inventory items from localDB
      const allInventory = await localDB.getAllInventoryItems();
      console.log('Retrieved all inventory from localDB:', allInventory);
      
      // Create a map to store the latest state for each item, grouped by name
      const latestInventoryMap = {};
      
      // First, group all items by their name
      const itemsByName = {};
      allInventory.forEach(item => {
        if (item.name) {
          const key = item.name.toLowerCase();
          if (!itemsByName[key]) {
            itemsByName[key] = [];
          }
          itemsByName[key].push({
            ...item,
            timestamp: new Date(item.created_at || item.updated_at || 0).getTime()
          });
        }
      });
      
      // For each group, find the item with non-zero values and latest timestamp
      Object.entries(itemsByName).forEach(([key, items]) => {
        // Sort by timestamp descending
        items.sort((a, b) => b.timestamp - a.timestamp);
        
        // Find the most recent item with non-zero values
        const latestItem = items.find(item => 
          (item.start > 0 || item.left > 0 || item.add > 0 || item.sold > 0)
        ) || items[0]; // Fallback to most recent if no non-zero values found
        
        if (latestItem) {
          latestInventoryMap[key] = latestItem;
        }
      });
      
      console.log('Latest inventory map with non-zero values:', latestInventoryMap);

      // Ensure we have a valid session ID
      let sessionId;
      if (session?.id) {
        sessionId = session.id;
      } else {
        // Create a new session if none exists
        const emergencySession = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          session_date: new Date().toISOString().split('T')[0],
          employee_id: newEmployeeId,
          status: 'active'
        };
        await localDB.storeSession(emergencySession);
        setCurrentSession(emergencySession);
        sessionId = emergencySession.id;
        console.log('Created emergency session due to missing session:', emergencySession);
      }

      // Update inventory for new shift using the latest state from localDB
      const updatedInventory = inventoryItems.map(item => {
        const latestItem = latestInventoryMap[item.name.toLowerCase()];
        console.log(`Processing item ${item.name}:`, { 
          current: item, 
          latest: latestItem,
          latestLeft: latestItem?.left,
          latestStart: latestItem?.start
        });
        
        // If we have a latest item with actual values, use those
        if (latestItem && (latestItem.left > 0 || latestItem.start > 0)) {
          // Use the left value from the latest record as both start and left
          const stockValue = latestItem.left || latestItem.start || 0;
          
          return {
            ...item,
            start: stockValue,     // Set start to the current stock level
            add: 0,               // Reset add
            sold: 0,              // Reset sold
            total: 0,             // Reset total
            left: stockValue,     // Set left to the current stock level
            pos_session_id: sessionId,
            price: latestItem.price || item.price, // Preserve price if available
            qty: latestItem.qty || item.qty       // Preserve qty if available
          };
        }
        
        // If no valid latest values, preserve current values if they exist
        const currentStock = item.left || item.start || 0;
        
        return {
          ...item,
          start: currentStock,    // Keep current stock level
          add: 0,                // Reset add
          sold: 0,               // Reset sold
          total: 0,              // Reset total
          left: currentStock,    // Keep current stock level
          pos_session_id: sessionId
        };
      });
      
      console.log('Updated inventory:', updatedInventory);
      
      setInventoryItems(updatedInventory);
      
      // Store the updated inventory in localDB
      await localDB.storeInventoryItems(updatedInventory);
      
      console.log('Successfully updated inventory with session ID:', sessionId);
    } catch (error) {
      console.error('Error updating inventory during employee switch:', error);
      // In case of error, keep the current inventory but reset add/sold
      const safeInventory = inventoryItems.map(item => ({
        ...item,
        add: 0,
        sold: 0,
        total: 0
      }));
      setInventoryItems(safeInventory);
    }

      // Load tickets for current session
      const allStoredTickets = await localDB.getAllTickets();
      const currentSessionId = existingSession?.id || newSession?.id;
      
      // Filter tickets for current session
      const sessionTickets = allStoredTickets.filter(ticket => 
        ticket.pos_session_id === currentSessionId &&
        ticket.id !== 'message' &&
        (ticket.ticketNumber || ticket.ticket_number) &&
        ((ticket.wash > 0 || ticket.dry > 0) ||
         (ticket.wash_amount > 0 || ticket.dry_amount > 0))
      ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setAllStoredTickets(sessionTickets);
      console.log('Loaded tickets for current session:', sessionTickets);

      // Generate new tickets for the new employee while preserving old ones in localDB
      try {
        // Get new sequential ticket numbers
        const ticketNumbers = await posService?.generateTicketNumbers(3);
        const newTickets = ticketNumbers?.map((ticketNum, index) => ({
          id: crypto.randomUUID(), // Use UUID to avoid conflicts with old tickets
          ticketNumber: ticketNum,
          wash: 0,
          dry: 0,
          total: 0,
          pos_session_id: session?.id // Link to new session
        }));
        
        setTickets(newTickets);
        console.log('Generated new tickets for employee switch:', newTickets);
      } catch (error) {
        console.error('Error generating new tickets:', error);
        // Fallback to basic tickets if generation fails
        const newTickets = [
          { id: crypto.randomUUID(), ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: session?.id },
          { id: crypto.randomUUID(), ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: session?.id },
          { id: crypto.randomUUID(), ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: session?.id }
        ];
        setTickets(newTickets);
      }

    // Reset cash section for new employee shift
    setCashData({
      started: 0,
      added: 0,
      total: 0
    });

    // Reset notes for new employee
    setNotes('');

    // Clear any active input states
    setActiveInput(null);
    setCurrentInputValue('');
    setIsInputMode(false);

    // Show confirmation message specifying what was reset
    alert(`Switched to new employee. 

🔄 Reset for new employee shift:
• START fields: Set to previous LEFT (actual stock)
• SOLD fields: All reset to 0
• ADD fields: All reset to 0
• Cash section: Reset to 0
• Tickets: Fresh sequential numbers generated
• Notes: Cleared

✅ START stock levels now match previous shift's actual stock.`);

    // Check for existing session for this employee today
    const existingSession = await localDB.getSessionByEmployeeAndDate(newEmployeeId, getTodayDate());
    
    if (existingSession) {
      console.log('Using existing session for employee:', existingSession);
      setCurrentSession(existingSession);
      localStorage.setItem('current_session_id', existingSession.id);
    } else {
      // Generate a new session only if one doesn't exist
      const newSessionId = crypto.randomUUID();
      const newSession = {
      id: newSessionId,
      created_at: new Date().toISOString(),
        session_date: getTodayDate(),
      employee_id: newEmployeeId,
        status: 'active',
        notes: '',
        inventory_total: 0,
        wash_dry_total: 0,
        grand_total: 0,
        cash_started: 0,
        cash_added: 0,
        coins_used: 0,
        cash_total: 0
      };
      
      // Save new session to localDB
      await localDB.storeSession(newSession);
      console.log('Created new session for employee:', newSession);
      setCurrentSession(newSession);
      localStorage.setItem('current_session_id', newSessionId);
    }
  };

  const loadEmployeeData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Set default clock status to clocked-out for all users
      setClockStatus('clocked-out');
      
      // Following offline-first principle - no default inventory
      const localInventory = await localDB.getAllInventoryItems();
      setInventoryItems(localInventory || []);
      
      // Initialize with default ticket numbers and unique IDs
      const defaultTickets = [
        { id: crypto.randomUUID(), ticketNumber: '001', wash: 0, dry: 0, total: 0 },
        { id: crypto.randomUUID(), ticketNumber: '002', wash: 0, dry: 0, total: 0 },
        { id: crypto.randomUUID(), ticketNumber: '003', wash: 0, dry: 0, total: 0 }
      ];
      
      setTickets(defaultTickets);
      
      // Generate a proper UUID v4 for the local session
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
      
      // ENFORCE: Only create session if selectedEmployee is a valid UUID
      if (!selectedEmployee || typeof selectedEmployee !== 'string' || selectedEmployee.length < 10) {
        setCurrentSession(null);
        setLoading(false);
        return;
      }
      setCurrentSession({ 
        id: generateUUID(),
        created_at: new Date().toISOString(),
        employee_id: selectedEmployee,
        status: 'active' 
      });
      
      // Set default cash data
      setCashData({
        started: 0,
        added: 0,
        total: 0
      });
      
      console.log('✅ Loaded local employee data');
    } catch (error) {
      console.error('Error loading employee data:', error);
      setError('Failed to load employee data. Using default values.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-calculate totals whenever data changes
  useEffect(() => {
    const inventoryTotal = inventoryItems?.reduce((sum, item) => sum + (item?.total || 0), 0);
    const washDryTotal = tickets?.reduce((sum, ticket) => sum + (ticket?.total || 0), 0);
    const grandTotal = inventoryTotal + washDryTotal;
    
    setTotals({
      inventorySalesTotal: inventoryTotal,
      washDrySubtotal: washDryTotal,
      grandTotal: grandTotal
    });
  }, [inventoryItems, tickets]);

  // Auto-calculate cash total
  useEffect(() => {
    setCashData(prev => ({
      ...prev,
      total: (prev?.started || 0) + (prev?.added || 0) - (prev?.coinsUsed || 0)
    }));
  }, [cashData?.started, cashData?.added, cashData?.coinsUsed]);

  // Handle field click with proper input mode
  const handleFieldClick = (fieldInfo) => {
    // If clicking the same field, just toggle input mode
    if (activeInput && 
        activeInput.section === fieldInfo.section && 
        activeInput.id === fieldInfo.id && 
        activeInput.field === fieldInfo.field) {
      setIsInputMode(!isInputMode);
      return;
    }

    // Clear input state when switching fields
    setCurrentInputValue('');
    setIsInputMode(true);
    setActiveInput(fieldInfo);

    // For inventory fields, pre-fill with current value
    if (fieldInfo.section === 'inventory') {
      const item = inventoryItems.find(i => i.id === fieldInfo.id);
      if (item && item[fieldInfo.field] !== undefined) {
        setCurrentInputValue(item[fieldInfo.field].toString());
      }
    }
    // For cash fields, pre-fill with current value
    else if (fieldInfo.section === 'cash' && cashData[fieldInfo.field] !== undefined) {
      setCurrentInputValue(cashData[fieldInfo.field].toString());
    }
  };

  // Enhanced field value update with proper decimal handling
  const updateFieldValue = (value) => {
    const { section, id, field } = activeInput;

    // Round to 2 decimal places to prevent floating point precision issues
    const roundedValue = Math.round(value * 100) / 100;

    if (section === 'inventory') {
      setInventoryItems(prev => prev?.map(item => {
        if (item?.id === id) {
          const updatedItem = { ...item, [field]: roundedValue };
          // Auto-calculate left and total with proper rounding
          if (field === 'start' || field === 'add' || field === 'sold') {
            const start = updatedItem?.start || 0;
            const add = updatedItem?.add || 0;
            const sold = updatedItem?.sold || 0;
            const price = updatedItem?.price || 0;
            
            updatedItem.left = Math.max(0, start + add - sold); // Prevent negative inventory
            updatedItem.total = Math.round(sold * price * 100) / 100; // Proper currency rounding
            
            // Update master inventory item in database immediately
            updateMasterInventoryItem(updatedItem);
          }
          return updatedItem;
        }
        return item;
      }));
    } else if (section === 'tickets') {
      setTickets(prev => prev?.map(ticket => {
        if (ticket?.id === id) {
          const updatedTicket = { ...ticket, [field]: roundedValue };
          // Auto-calculate total with proper rounding
          const wash = updatedTicket?.wash || 0;
          const dry = updatedTicket?.dry || 0;
          updatedTicket.total = Math.round((wash + dry) * 100) / 100;
          return updatedTicket;
        }
        return ticket;
      }));
    } else if (section === 'cash') {
      setCashData(prev => ({
        ...prev,
        [field]: roundedValue
      }));
    }
  };

  // New function to update master inventory items in real-time
  const updateMasterInventoryItem = async (updatedItem) => {
    if (!updatedItem?.dbId) return; // Only update if we have a database ID
    
    try {
      // Update master inventory item in database to maintain sync
      const { error } = await supabase
        ?.from('pos_inventory_items')
        ?.update({
          start_count: updatedItem?.start || 0,
          left_count: updatedItem?.left || 0,
          sold_count: updatedItem?.sold || 0,
          add_count: updatedItem?.add || 0,
          total_amount: updatedItem?.total || 0,
          updated_at: new Date()?.toISOString()
        })
        ?.eq('id', updatedItem?.dbId)
        ?.is('pos_session_id', null); // Only update master items

      if (error) {
        console.error('Failed to update master inventory:', error);
      } else {
        console.log(`✅ Master inventory updated: ${updatedItem?.name} - Stock: ${updatedItem?.left}`);
      }
    } catch (error) {
      console.error('Error updating master inventory:', error);
    }
  };

  const handleNumberInput = (digit) => {
    if (!activeInput) return;
    
    setIsInputMode(true);
    
    // Build the decimal number as string to maintain precision
    const newValue = currentInputValue + digit;
    setCurrentInputValue(newValue);
    
    // For ticket fields
    if (tickets[0] && activeInput === 'ticketNumber') {
      handleFieldChange('ticketNumber', newValue, tickets[0].id);
    } else if (tickets[0] && (activeInput === 'wash' || activeInput === 'dry')) {
      const numericValue = parseFloat(newValue);
      if (!isNaN(numericValue)) {
        handleFieldChange(activeInput, numericValue, tickets[0].id);
      }
    }
    // For inventory fields
    else if (activeInput.section === 'inventory') {
      const numericValue = parseFloat(newValue);
      if (!isNaN(numericValue)) {
        updateFieldValue(numericValue);
      }
    }
    // For cash fields
    else if (activeInput.section === 'cash') {
      const numericValue = parseFloat(newValue);
      if (!isNaN(numericValue)) {
        updateFieldValue(numericValue);
      }
    }
  };

  const handleDecimalInput = () => {
    if (!activeInput) return;
    
    // Only allow decimal for wash/dry fields
    if (activeInput !== 'wash' && activeInput !== 'dry') return;
    
    // Prevent multiple decimal points
    if (currentInputValue?.includes('.')) return;
    
    setIsInputMode(true);
    
    // Add decimal point - start with "0." if empty
    const newValue = currentInputValue === '' ? '0.' : currentInputValue + '.';
    setCurrentInputValue(newValue);
    
    // For ticket fields
    if (tickets[0]) {
      const numericValue = parseFloat(newValue);
      if (!isNaN(numericValue)) {
        handleFieldChange(activeInput, numericValue, tickets[0].id);
      } else {
        handleFieldChange(activeInput, 0, tickets[0].id);
      }
    }
  };

  const handleClear = () => {
    if (!activeInput || !tickets[0]) return;
    
    setCurrentInputValue('');
    setIsInputMode(true);  // Keep input mode active
    
    // Clear the active field
    if (activeInput === 'ticketNumber') {
      handleFieldChange('ticketNumber', '', tickets[0].id);
    } else if (activeInput === 'wash' || activeInput === 'dry') {
      handleFieldChange(activeInput, 0, tickets[0].id);
    }
  };

  const handleEnter = () => {
    // Just clear input mode without resetting values
    setIsInputMode(false);
    setActiveInput(null);
    setCurrentInputValue('');
  };

  // FIXED: Enhanced display value function that shows current input or formatted value
  const getDisplayValue = (section, id, field, actualValue) => {
    // Check if this is the currently active field AND user is in input mode
    const isCurrentField = activeInput?.section === section && 
                           activeInput?.id === id && 
                           activeInput?.field === field;
    
    // Only show currentInputValue if user is actively typing
    if (isCurrentField && isInputMode && currentInputValue !== '') {
      return currentInputValue;
    }
    
    // For newly clicked fields, show empty until user starts typing
    if (isCurrentField && !isInputMode) {
      return ''; // Show empty for newly clicked field
    }
    
    // Show the formatted actual value for inactive fields
    if (section === 'cash' || field === 'total' || field === 'price') {
      return (actualValue || 0)?.toFixed(2);
    }
    
    return (actualValue || 0)?.toString();
  };

  // Local storage clock in/out handlers
  const handleClockIn = async () => {
    try {
      setLoading(true);
      setError(null);
      // Validate employee selection
      if (!selectedEmployee) {
        throw new Error('Please select an employee before clocking in.');
      }
      // Fetch the selected employee object from the employee list
      const employeeObj = employeeList.find(emp => emp.id === selectedEmployee);
      console.log('Clock In: selectedEmployee id:', selectedEmployee);
      console.log('Clock In: employee object:', employeeObj);
      if (!employeeObj) {
        throw new Error('Selected employee not found in employee list.');
      }

      // Create timesheet entry
      const now = new Date();
      const timesheet = {
        id: crypto.randomUUID(),
        employee_id: employeeObj.id,
        clock_in_time: now.toISOString(),
        clock_out_time: null,
        created_at: now.toISOString()
      };

      // Store timesheet in both localStorage and localDB
      const timesheetData = {
        ...timesheet,
        work_duration: 0,
        updated_at: now.toISOString()
      };
      
      localStorage.setItem('active_timesheet', JSON.stringify(timesheetData));
      
      // Store in localDB (this will mark it as unsynced)
      await localDB.storeTimesheet(timesheetData);
      console.log('✅ Stored timesheet in localDB:', timesheetData);

      // If online, save to Supabase
      if (navigator.onLine) {
        const { error } = await supabase
          .from('employee_timesheets')
          .insert([{
            id: timesheet.id,
            employee_id: timesheet.employee_id,
            clock_in_time: timesheet.clock_in_time,
            clock_out_time: null,
            created_at: timesheet.created_at
          }]);

        if (error) throw error;
        
        // If Supabase save successful, mark as synced in localDB
        await localDB.markTimesheetsSynced([timesheet.id]);
      }
      
      // Update state
      setActiveClockIn(timesheet);
      setClockStatus('clocked-in');
      setClockTime(now);
      setShowClockInModal(false);
      
      // Persist clock-in state
      localStorage.setItem('active_clock_in', JSON.stringify(timesheet));
      localStorage.setItem('selected_employee', selectedEmployee);
      
      // Show success message
      alert(`${employeeObj.full_name || selectedEmployee} clocked in successfully at ${now.toLocaleTimeString()}`);
    } catch (error) {
      console.error('Error in handleClockIn:', error);
      const errorMessage = error.message || 'Failed to clock in';
      setError(errorMessage);
      alert(`Clock in failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle clock out with local storage
  const handleClockOut = async () => {
    // Restore selectedEmployee from localStorage if missing
    let employeeId = selectedEmployee;
    if (!employeeId) {
      employeeId = localStorage.getItem('selected_employee');
      if (employeeId) setSelectedEmployee(employeeId);
    }
    if (!employeeId || typeof employeeId !== 'string' || employeeId.length < 10) {
      alert('Please select an employee before clocking out.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Get active timesheet record
      const activeTimesheetStr = localStorage.getItem('active_timesheet');
      if (!activeTimesheetStr) {
        throw new Error('No active timesheet found');
      }

      const activeTimesheet = JSON.parse(activeTimesheetStr);
      const now = new Date();
      const clockInTime = new Date(activeTimesheet.clock_in_time);
      
      // Calculate duration in hours
      const durationHours = (now - clockInTime) / (1000 * 60 * 60);
      const hours = Math.floor(durationHours);
      const minutes = Math.round((durationHours % 1) * 60);
      const workDuration = `${hours}h ${minutes}m`;

      // Update timesheet record
      const timesheet = {
        ...activeTimesheet,
        clock_out_time: now.toISOString()
      };

      // Store updated timesheet in both localStorage and localDB
      const updatedTimesheet = {
        ...timesheet,
        work_duration_minutes: Math.round(durationHours * 60), // Convert hours to minutes
        updated_at: now.toISOString()
      };
      
      localStorage.setItem('active_timesheet', JSON.stringify(updatedTimesheet));
      
      // Store in localDB (this will mark it as unsynced)
      await localDB.storeTimesheet(updatedTimesheet);
      console.log('✅ Updated timesheet in localDB:', updatedTimesheet);

      // If online, save to Supabase
      if (navigator.onLine) {
        const { error } = await supabase
          .from('employee_timesheets')
          .update({
            clock_out_time: timesheet.clock_out_time,
            updated_at: now.toISOString()
          })
          .eq('id', timesheet.id);

        if (error) throw error;
        
        // If Supabase save successful, mark as synced in localDB
        await localDB.markTimesheetsSynced([timesheet.id]);
      }
      
      // Update state
      setActiveClockIn(null);
      setClockStatus('clocked-out');
      setClockTime(null);
      
      // Remove persisted clock-in state
      localStorage.removeItem('active_clock_in');

      // Show success message
      const employeeObj = employeeList.find(emp => emp.id === employeeId);
      const employeeName = employeeObj?.full_name || employeeId;
      alert(`${employeeName} clocked out successfully at ${now.toLocaleTimeString()} (Worked: ${workDuration})`);
    } catch (error) {
      console.error('Error in handleClockOut:', error);
      setError(`Clock out failed: ${error?.message || 'Unknown error'}`);
      alert(`Clock out failed: ${error?.message || 'Unknown error'}\n\n⚠️ Please ensure:\n• Employee is selected\n• Employee is currently clocked in`);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to log employee list and last ticket number
  const logEmployeeAndTicketInfo = async () => {
    try {
      // Log the list of employees from database
      console.log('=== Fetching Employee List from Database ===');
      
      try {
        // Fetch employees from user_profiles table
        const { data: employees, error: employeeError } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, role')
          .order('full_name', { ascending: true });
        
        if (employeeError) throw employeeError;
        
        if (employees?.length > 0) {
          console.log('=== Employee List ===');
          employees.forEach((emp, index) => {
            console.log(`${index + 1}. ${emp.full_name} (${emp.role || 'No Role'}) - ${emp.email || 'No Email'}`);
          });
          
          // Update the local employee list with fresh data
          const freshEmployeeList = employees.map(emp => emp.full_name);
          setEmployeeList(freshEmployeeList);
        } else {
          console.log('No employees found in the database');
        }
      } catch (employeeError) {
        console.warn('Error fetching employees:', employeeError.message);
        console.log('Falling back to local employee list');
      }

      // Log ticket information
      console.log('\n=== Ticket Information ===');
      
      try {
        // First check if we have a valid supabase client and session
        if (!supabase) {
          console.warn('Supabase client not initialized');
          return;
        }

        // Check if we have a valid session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('No active session, skipping ticket fetch');
          return;
        }

        // Use a try-catch block for the actual query
        try {
          const { data: latestTicket, error: ticketError } = await supabase
            .from('pos_wash_dry_tickets')
            .select('ticket_number, created_at, wash_amount, dry_amount')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (ticketError) throw ticketError;
          
          if (latestTicket) {
            const washAmount = Number(latestTicket.wash_amount) || 0;
            const dryAmount = Number(latestTicket.dry_amount) || 0;
            const total = washAmount + dryAmount;
            
            console.log('Latest Ticket from Database:');
            console.log(`  #${String(latestTicket.ticket_number).padStart(3, '0')} - $${total.toFixed(2)}`);
            console.log(`  Created: ${new Date(latestTicket.created_at).toLocaleString()}`);
            console.log(`  Wash: $${washAmount.toFixed(2)}, Dry: $${dryAmount.toFixed(2)}`);
          } else {
            console.log('No tickets found in the database');
          }
        } catch (queryError) {
          // Handle specific Supabase errors
          if (queryError.code === 'PGRST116' || queryError.code === 'PGRST200') {
            console.log('No tickets found in the database');
          } else if (queryError.code === '406' || queryError.code === '401') {
            console.warn('Authentication or permission error:', queryError.message);
            console.log('Falling back to local ticket data');
          } else {
            console.warn('Error fetching latest ticket (non-critical):', queryError.message);
            console.log('Falling back to local ticket data');
          }
        }
      } catch (ticketError) {
        console.warn('Error fetching latest ticket:', ticketError.message);
      }
      
      // Show current session tickets
      const validTickets = tickets.filter(t => t?.ticketNumber);
      if (validTickets.length > 0) {
        console.log('\n=== Current Session Tickets ===');
        console.log(`Total Tickets: ${validTickets.length}`);
        
        // Show the last 3 tickets in the current session
        const recentTickets = [...validTickets].reverse().slice(0, 3);
        recentTickets.forEach((ticket, idx) => {
          console.log(`  ${idx + 1}. #${String(ticket.ticketNumber).padStart(3, '0')} - $${Number(ticket.total || 0).toFixed(2)}`);
        });
      } else {
        console.log('\nNo tickets in current session');
      }
      
    } catch (error) {
      console.error('Unexpected error in logEmployeeAndTicketInfo:', error);
      
      // Fallback to local data if available
      if (Array.isArray(employeeList) && employeeList.length > 0) {
        console.log('\n=== Local Employee List (Fallback) ===');
        employeeList.forEach((emp, index) => {
          console.log(`${index + 1}. ${emp}`);
        });
      }
      
      // Show local ticket info if available
      const validTickets = tickets.filter(t => t?.ticketNumber);
      if (validTickets.length > 0) {
        console.log('\n=== Local Ticket Info (Fallback) ===');
        const lastTicket = validTickets[validTickets.length - 1];
        console.log(`Last Ticket: #${String(lastTicket.ticketNumber).padStart(3, '0')} - $${Number(lastTicket.total || 0).toFixed(2)}`);
      }
    }
  };

  // Function to fetch and log all inventory items
  const fetchAndLogInventory = async () => {
    try {
      console.log('🔍 Fetching current inventory items...');
      const { data: allInventory, error } = await supabase
        .from('pos_inventory_items')
        .select('*')
        .order('item_name', { ascending: true });
        
      if (error) {
        console.warn('⚠️ Could not fetch inventory items:', error.message);
        return [];
      }
      
      if (allInventory && allInventory.length > 0) {
        console.log('📋 Current Inventory Items in Database:');
        console.table(allInventory.map(item => ({
          ID: item.id,
          'Item Name': item.item_name,
          'Price': item.price,
          'Start': item.start_count,
          'Add': item.add_count,
          'Sold': item.sold_count,
          'Left': item.left_count,
          'Total': item.total_amount,
          'Updated': new Date(item.updated_at).toLocaleString()
        })));
      } else {
        console.log('ℹ️ No inventory items found in the database');
      }
      
      return allInventory || [];
    } catch (err) {
      console.error('❌ Error fetching inventory:', err);
      return [];
    }
  };

  // Save all data to database and fetch updated information
  const handleSave = async () => {
    try {
      // Ensure localDB is ready before any operations
      await localDB.ready;
      
      // Step 1: Always try to download and store initial data when Save Progress is clicked
      if (navigator.onLine) {
        console.log('🔄 Downloading latest data from server...');
        
        // Fetch and store employees first
        const { data: employees, error: empError } = await supabase.from('user_profiles').select('*');
        if (empError) {
          console.error('Error fetching employees:', empError);
          alert('Error downloading employee data. Please try again.');
          return;
        }
        
        if (!employees || employees.length === 0) {
          alert('No employees found in database. Please contact administrator.');
          return;
        }

        // First ensure localDB is ready
        await localDB.ready;

        // Store employees in batches to prevent database closing
        const batchSize = 5;
        for (let i = 0; i < employees.length; i += batchSize) {
          const batch = employees.slice(i, i + batchSize);
          
          // Process each batch
          await Promise.all(batch.map(async (employee) => {
            let retries = 3;
            while (retries > 0) {
              try {
                // Wait for any previous transaction to complete
                await new Promise(resolve => setTimeout(resolve, 100));
            await localDB.storeEmployeeProfile(employee);
                break; // Success, exit retry loop
              } catch (error) {
                retries--;
                if (retries === 0) {
                  console.error('Failed to store employee after retries:', employee.id);
                  // Don't throw, just log and continue with other employees
                  console.error('Error details:', error);
                }
                // Wait longer between retries
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
          }));

          // Wait between batches
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Update UI with downloaded employees
          setEmployeeList(employees);
          console.log('✅ Downloaded and stored employees:', employees.length);

        // If no employee is selected, prompt user to select one
        if (!selectedEmployee) {
          alert('Please select an employee to continue.');
          return;
        }

        // Fetch last 10 tickets from Supabase
        const { data: lastTickets, error: ticketsError } = await supabase
          .from('pos_wash_dry_tickets')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!ticketsError && lastTickets?.length > 0) {
          // Store tickets in localDB
          await localDB.storeTickets(lastTickets);
          setAllStoredTickets(lastTickets);
          console.log('✅ Downloaded and stored last tickets:', lastTickets.length);
        } else {
          // If no tickets found in Supabase, set a message in the history
          setAllStoredTickets([{
            id: 'message',
            ticketNumber: 'No tickets found in server - you can start any number you want',
            wash: 0,
            dry: 0,
            total: 0,
            created_at: new Date().toISOString()
          }]);
        }

        // Fetch and store master inventory
        const { data: masterInventory, error: invError } = await supabase.from('master_inventory_items').select('*');
        if (!invError && masterInventory?.length > 0) {
          // Get existing inventory from localDB first
          const existingInventory = await localDB.getAllInventoryItems();
          const existingMap = {};
          
          // Create a map of the most recent values for each item
          existingInventory.forEach(item => {
            if (item.name) {
              const key = item.name.toLowerCase();
              if (!existingMap[key] || new Date(item.created_at || 0) > new Date(existingMap[key].created_at || 0)) {
                existingMap[key] = item;
              }
            }
          });

          // Transform master inventory items while preserving existing values
          const formattedInventory = masterInventory.map(item => {
            const existingItem = existingMap[item.item_name.toLowerCase()];
            return {
              id: item.id,
              name: item.item_name,
              qty: item.quantity || existingItem?.qty || 1,
              price: Number(item.price || existingItem?.price || 0),
              start: existingItem?.left || existingItem?.start || 0,
              add: 0,
              sold: 0,
              left: existingItem?.left || existingItem?.start || 0,
              total: 0,
              pos_session_id: currentSession?.id // Ensure session ID is set
            };
          });
          
          console.log('Merging master inventory with existing values:', {
            existing: existingMap,
            formatted: formattedInventory
          });
          
          await localDB.storeInventoryItems(formattedInventory);
          setInventoryItems(formattedInventory);
          console.log('✅ Downloaded and stored master inventory:', masterInventory.length);
        }
      }

      // Check if we already have a session for this employee and date
      const today = new Date().toISOString().split('T')[0];
      let existingSession = await localDB.getSessionByEmployeeAndDate(selectedEmployee, today);

      // Create or update session
      // Validate employee ID before creating session
      if (!selectedEmployee || typeof selectedEmployee !== 'string' || selectedEmployee.length < 10) {
        throw new Error('Invalid employee ID. Please select a valid employee before saving.');
      }

      const sessionToSave = {
        id: existingSession?.id || currentSession?.id || crypto.randomUUID(),
        created_at: existingSession?.created_at || currentSession?.created_at || new Date().toISOString(),
        session_date: today,
        employee_id: selectedEmployee, // Remove empty string fallback
        status: 'active',
        notes: notes || '',
        inventory_total: totals.inventorySalesTotal || 0,
        wash_dry_total: totals.washDrySubtotal || 0,
        grand_total: totals.grandTotal || 0,
        cash_started: cashData.started || 0,
        cash_added: cashData.added || 0,
        coins_used: cashData.coinsUsed || 0,
        cash_total: cashData.total || 0,
        updated_at: new Date().toISOString()
      };

      // Save session to localDB
      await localDB.storeSession(sessionToSave);
      console.log('✅ Saved session to localDB:', sessionToSave);

      // Save inventory items to localDB with session ID
      const inventoryWithSession = inventoryItems.map(item => ({
        ...item,
        pos_session_id: sessionToSave.id,
        synced: navigator.onLine ? 1 : 0 // Only mark as unsynced when offline
      }));
      await localDB.storeInventoryItems(inventoryWithSession);
      console.log('✅ Saved inventory items to localDB:', inventoryWithSession.length);

      // Save only new tickets to localDB with current session ID
      const newTickets = tickets.filter(ticket => !ticket.id || ticket.id.toString().length < 10);
      const ticketsWithSession = newTickets.map(ticket => ({
        ...ticket,
        id: crypto.randomUUID(),
        pos_session_id: sessionToSave.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      
      if (ticketsWithSession.length > 0) {
      await localDB.storeTickets(ticketsWithSession);
        console.log('✅ Saved new tickets to localDB:', ticketsWithSession);
      }

      // Handle offline state and validation
      if (!navigator.onLine) {
        alert('No internet detected. Data saved to localDB. Will sync to server when online.');
        return; // Don't try to sync if offline
      } 
      
      // Validate employee selection and session ID
      if (!selectedEmployee) {
        alert('Error: No employee selected. Please select an employee before saving.');
        return;
      } 
      
      if (!sessionToSave.id) {
        alert('Error: Invalid session ID. Please refresh and try again.');
        return;
      }

      // Step 2: Upload everything to Supabase
      console.log('🔄 Uploading data to Supabase...');

      // Get all unsynced sessions from localDB
      const unsyncedSessions = await localDB.getUnsyncedSessions();
      console.log('Found unsynced sessions to upload:', unsyncedSessions);

      // Create a map of old session IDs to new ones (in case we need to create new sessions)
      const sessionIdMap = {};

      // First ensure we have a valid session
      let currentSessionId = sessionToSave.id || currentSession?.id;
      console.log('Using session:', currentSessionId);

      // Validate we have what we need
      if (!currentSessionId || !selectedEmployee) {
        console.error('❌ No valid session or employee');
        alert('Please select an employee and ensure you have an active session before saving.');
        return;
      }

      // First check if sessions exist for this employee today
      const { data: activeSessions, error: checkError } = await supabase
        .from('pos_sessions')
        .select('*')
        .match({ 
          employee_id: selectedEmployee,
          session_date: getTodayDate(),
          status: 'active'
        })
        .order('created_at', { ascending: false }); // Get most recent first

      if (checkError) {
        console.error('❌ Error checking for active sessions:', checkError);
        return;
      }

      // Handle multiple sessions case
      let activeSession;
      if (activeSessions && activeSessions.length > 0) {
        // First try to find our local session in the active sessions
        activeSession = activeSessions.find(s => s.id === currentSessionId);
        
        if (!activeSession) {
          // If our local session isn't found, use the most recent
          if (activeSessions.length > 1) {
            console.warn(`Found ${activeSessions.length} active sessions for today. Using most recent.`);
            // Mark older sessions as inactive
            const oldSessions = activeSessions.slice(1);
            for (const session of oldSessions) {
              await supabase
                .from('pos_sessions')
                .update({ status: 'inactive', updated_at: new Date().toISOString() })
                .eq('id', session.id);
            }
          }
          // Use the most recent session
          activeSession = activeSessions[0];
          console.log('Using most recent active session:', activeSession.id);
          currentSessionId = activeSession.id;
        } else {
          console.log('Found matching session in Supabase:', activeSession.id);
        }
        
        // Update active session with current values but preserve creation time
        const sessionPayload = {
          id: activeSession.id,
          created_at: activeSession.created_at, // Keep original creation time
          session_date: getTodayDate(),
          employee_id: selectedEmployee,
          status: 'active',
          notes: notes || '',
          inventory_total: totals.inventorySalesTotal || 0,
          wash_dry_total: totals.washDrySubtotal || 0,
          grand_total: totals.grandTotal || 0,
          cash_started: cashData.started || 0,
          cash_added: cashData.added || 0,
          coins_used: cashData.coinsUsed || 0,
          cash_total: cashData.total || 0,
          updated_at: new Date().toISOString()
        };

        console.log('Upserting session in Supabase:', sessionPayload);
        const { error: createError } = await supabase
          .from('pos_sessions')
          .upsert([sessionPayload], {
            onConflict: 'id',
            ignoreDuplicates: false
          });

        if (createError) {
          console.error('❌ Failed to upsert session in Supabase:', createError);
          return;
        }
        console.log('✅ Created new session in Supabase:', currentSessionId);
      }

      // Following offline-first rules:
      // 1. First try to use the current session from localStorage
      const storedSessionId = localStorage.getItem('current_session_id');
      let localActiveSession;
      
      if (storedSessionId) {
        localActiveSession = await localDB.getSession(storedSessionId);
        // Verify it's valid for current employee and date
        if (localActiveSession?.employee_id !== selectedEmployee || 
            localActiveSession?.session_date !== getTodayDate()) {
          localActiveSession = null;
        }
      }
      
      // If no valid stored session, check for today's session
      if (!localActiveSession) {
        localActiveSession = await localDB.getSessionByEmployeeAndDate(selectedEmployee, getTodayDate());
      }
      
      // If we have a valid session, use it
      if (localActiveSession) {
        console.log('Using existing session:', localActiveSession.id);
        currentSessionId = localActiveSession.id;
        // Update localStorage to maintain consistency
        localStorage.setItem('current_session_id', localActiveSession.id);
      }

      // 2. Get all sessions that need to be synced
      let sessionsToSync = [...unsyncedSessions]; // Copy existing unsynced sessions
      console.log('Found unsynced sessions:', sessionsToSync);
      
      // 3. Add current session if it's not in the list and we don't have a local active session
      if (!sessionsToSync.find(s => s.id === currentSessionId) && !localActiveSession) {
        sessionsToSync.push({
          id: currentSessionId,
          created_at: new Date().toISOString(),
          session_date: new Date().toISOString().split('T')[0],
          employee_id: selectedEmployee,
          status: 'active',
          notes: notes || '',
          inventory_total: totals.inventorySalesTotal || 0,
          wash_dry_total: totals.washDrySubtotal || 0,
          grand_total: totals.grandTotal || 0,
          cash_started: cashData.started || 0,
          cash_added: cashData.added || 0,
          coins_used: cashData.coinsUsed || 0,
          cash_total: cashData.total || 0,
          updated_at: new Date().toISOString()
        });
      }
      
      // 3. Track uploaded sessions
      const uploadedSessionIds = new Set();

      // 4. Upload sessions one by one to prevent duplicates
      for (const session of sessionsToSync) {
        try {
          // First check if session exists
          const { data: existingSession, error: checkError } = await supabase
          .from('pos_sessions')
            .select('*')
            .match({ id: session.id })
            .maybeSingle();

          if (checkError) {
            console.error('❌ Error checking session:', session.id, checkError);
            continue;
          }

          const sessionPayload = {
            id: session.id,
            created_at: session.created_at,
            session_date: session.session_date,
            employee_id: session.employee_id,
            status: session.status,
            notes: session.notes || '',
            inventory_total: session.inventory_total || 0,
            wash_dry_total: session.wash_dry_total || 0,
            grand_total: session.grand_total || 0,
            cash_started: session.cash_started || 0,
            cash_added: session.cash_added || 0,
            coins_used: session.coins_used || 0,
            cash_total: session.cash_total || 0,
            updated_at: new Date().toISOString()
          };

          if (existingSession) {
            // Update existing session
            console.log('Updating session:', session.id);
            const { error: updateError } = await supabase
              .from('pos_sessions')
              .update(sessionPayload)
              .eq('id', session.id);

            if (updateError) {
              console.error('❌ Error updating session:', session.id, updateError);
              continue;
            }
          } else {
            // Insert new session
            console.log('Creating new session:', session.id);
            const { error: insertError } = await supabase
              .from('pos_sessions')
              .insert([sessionPayload]);

            if (insertError) {
              console.error('❌ Error creating session:', session.id, insertError);
              continue;
            }
          }

          // Mark as synced and track
        await localDB.markSessionsSynced([session.id]);
          uploadedSessionIds.add(session.id);
          console.log('✅ Session synced:', session.id);

        } catch (error) {
          console.error('❌ Error processing session:', session.id, error);
        }
      }

      // Log sync results
      console.log('✅ All sessions synced:', uploadedSessionIds.size);

      console.log('✅ All sessions uploaded to Supabase:', sessionsToSync.length);

      // Get all unsynced inventory items and current inventory items
      const [unsyncedInventory, currentInventory] = await Promise.all([
        localDB.getUnsyncedInventoryItems(),
        localDB.getAllInventoryItems()
      ]);

      // Add current inventory items if they're not already in unsynced
      const currentSessionItems = currentInventory.filter(item => item.pos_session_id === currentSessionId);
      const unsyncedIds = new Set(unsyncedInventory.map(item => item.id));
      const additionalItems = currentSessionItems.filter(item => !unsyncedIds.has(item.id));

      const allInventoryToSync = [...unsyncedInventory, ...additionalItems];
      console.log('Found inventory items to sync:', {
        unsynced: unsyncedInventory.length,
        current: additionalItems.length,
        total: allInventoryToSync.length
      });

      // First get all inventory items for these sessions from Supabase
      const { data: existingInventory, error: invCheckError } = await supabase
          .from('pos_inventory_items')
        .select('id, pos_session_id, item_name')
        .in('pos_session_id', [...uploadedSessionIds]);

      if (invCheckError) {
        console.error('❌ Error checking existing inventory:', invCheckError);
        return;
      }

      // Create lookup map for existing inventory
      const existingInventoryMap = new Map();
      existingInventory?.forEach(item => {
        const key = `${item.pos_session_id}_${item.item_name}`;
        existingInventoryMap.set(key, item.id);
      });

      // Prepare inventory items for update/insert
      const inventoryToUpdate = [];
      const inventoryToInsert = [];

      allInventoryToSync.forEach(item => {
        // Skip if session not verified
        if (!uploadedSessionIds.has(item.pos_session_id)) {
          console.log('Skipping inventory item - session not verified:', {
            item_name: item.name,
            session_id: item.pos_session_id
          });
          return;
        }

        const key = `${item.pos_session_id}_${item.name}`;
        const payload = {
          pos_session_id: item.pos_session_id,
          item_name: item.name,
          quantity: item.qty || 1,
          price: Number(item.price || 0),
          start_count: Number(item.start || 0),
          add_count: Number(item.add || 0),
          sold_count: Number(item.sold || 0),
          left_count: Number(item.left || 0),
          total_amount: Number(item.total || 0),
          created_at: item.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // If item exists, add its ID and update
        if (existingInventoryMap.has(key)) {
          payload.id = existingInventoryMap.get(key);
          inventoryToUpdate.push(payload);
        } else {
          inventoryToInsert.push(payload);
        }
      });

      // No need to delete existing inventory - we'll use upsert for updates

      // Filter and prepare inventory items that have valid session IDs
      // Handle inventory updates
      if (inventoryToUpdate.length > 0) {
        console.log('Updating existing inventory items:', inventoryToUpdate.length);
        const { error: updateError } = await supabase
        .from('pos_inventory_items')
          .upsert(inventoryToUpdate);

        if (updateError) {
          console.error('❌ Error updating inventory:', updateError);
        return;
      }
      }

      // Handle new inventory items
      if (inventoryToInsert.length > 0) {
        console.log('Inserting new inventory items:', inventoryToInsert.length);
        // Add unique IDs for each new item
        const itemsWithIds = inventoryToInsert.map(item => ({
          ...item,
          id: crypto.randomUUID()
        }));
        const { error: insertError } = await supabase
          .from('pos_inventory_items')
          .insert(itemsWithIds);

        if (insertError) {
          console.error('❌ Error inserting inventory:', insertError);
          return;
        }
      }

      // Mark all as synced
      await localDB.markInventoryItemsSynced(unsyncedInventory.map(item => item.id));

      console.log('✅ Inventory uploaded to Supabase:', {
        updated: inventoryToUpdate.length,
        inserted: inventoryToInsert.length
      });

       // Get all unsynced tickets
       const unsyncedTickets = await localDB.getUnsyncedTickets();
       console.log('Found unsynced tickets:', unsyncedTickets);

       // Get all session IDs from unsynced tickets
       const ticketSessionIds = [...new Set(unsyncedTickets
         .filter(ticket => ticket && ticket.pos_session_id)
         .map(ticket => ticket.pos_session_id))];
       
       // Verify these sessions exist in Supabase
       const { data: validSessions } = await supabase
         .from('pos_sessions')
         .select('id')
         .in('id', ticketSessionIds);
       
       const validSessionIds = validSessions?.map(s => s.id) || [];
       console.log('Valid session IDs in Supabase:', validSessionIds);

       // Delete existing tickets for valid sessions
       if (validSessionIds.length > 0) {
         await supabase
           .from('pos_wash_dry_tickets')
           .delete()
           .in('pos_session_id', validSessionIds);
       }

       // Filter out empty tickets and prepare payload
       // Group tickets by session ID and verify sessions exist
       const ticketsBySession = {};
       const uniqueSessionIds = new Set();
       
       unsyncedTickets.forEach(ticket => {
         if (ticket.pos_session_id) {
           uniqueSessionIds.add(ticket.pos_session_id);
           if (!ticketsBySession[ticket.pos_session_id]) {
             ticketsBySession[ticket.pos_session_id] = [];
           }
           ticketsBySession[ticket.pos_session_id].push(ticket);
         }
       });
       console.log('Tickets grouped by session:', ticketsBySession);

       // Prepare tickets for upload, maintaining session relationships
       const ticketPayload = unsyncedTickets
         .filter(ticket => {
           // First check if the ticket's session exists in Supabase
           const hasValidSession = validSessionIds.includes(ticket.pos_session_id);
           // Keep only tickets that have:
           // 1. A valid UUID (not numeric IDs which are templates)
           // 2. A ticket number
           // 3. Either wash or dry amount
           // 4. A valid session ID
           // Only proceed if session exists in Supabase
           if (!hasValidSession) {
             console.log('Skipping ticket due to invalid session:', ticket.id);
             return false;
           }

           const isValidId = typeof ticket.id === 'string' && ticket.id.includes('-');
           const hasNumber = ticket.ticketNumber || ticket.ticket_number;
           const hasAmount = (ticket.wash > 0 || ticket.dry > 0) || 
                           (ticket.wash_amount > 0 || ticket.dry_amount > 0);

           const isValid = isValidId && hasNumber && hasAmount;
           if (!isValid) {
             console.log('Skipping invalid ticket:', { id: ticket.id, hasNumber, hasAmount });
           }
           return isValid;
         })
         .map(ticket => {
           const { synced, ...ticketWithoutSync } = ticket;
           
           // Use existing amounts if they're in the old format
           const washAmount = ticket.wash_amount || ticket.wash || 0;
           const dryAmount = ticket.dry_amount || ticket.dry || 0;
           const totalAmount = ticket.total_amount || ticket.total || (washAmount + dryAmount);
           const ticketNumber = ticket.ticket_number || ticket.ticketNumber;
           
           return {
             id: ticket.id,
             pos_session_id: ticket.pos_session_id,
             ticket_number: ticketNumber,
             wash_amount: washAmount,
             dry_amount: dryAmount,
             total_amount: totalAmount,
             created_at: ticket.created_at || new Date().toISOString(),
             updated_at: new Date().toISOString()
           };
         });

       console.log('Uploading tickets to Supabase:', ticketPayload);

       const { error: ticketError } = await supabase
         .from('pos_wash_dry_tickets')
         .upsert(ticketPayload, { 
           onConflict: 'id',
           ignoreDuplicates: false
         });

      if (ticketError) {
        console.error('❌ Error uploading tickets to Supabase:', ticketError);
        alert('Error saving tickets to server. Data is safe in local storage.');
        return;
      }

      // Mark tickets as synced
      await localDB.markTicketsSynced(unsyncedTickets.map(t => t.id));
      console.log('✅ All tickets uploaded to Supabase:', ticketPayload.length);

      // Get all unsynced timesheets
      const unsyncedTimesheets = await localDB.getUnsyncedTimesheets();
      console.log('Found unsynced timesheets:', unsyncedTimesheets);

      if (unsyncedTimesheets.length > 0) {
        // First verify which timesheets already exist in Supabase
        const timesheetIds = unsyncedTimesheets.map(t => t.id);
        const { data: existingTimesheets } = await supabase
          .from('employee_timesheets')
          .select('id')
          .in('id', timesheetIds);

        const existingIds = new Set(existingTimesheets?.map(t => t.id) || []);

        // Split timesheets into updates and inserts
        const timesheetsToUpdate = [];
        const timesheetsToInsert = [];

        unsyncedTimesheets.forEach(timesheet => {
          const payload = {
            id: timesheet.id,
            employee_id: timesheet.employee_id,
            clock_in_time: timesheet.clock_in_time,
            clock_out_time: timesheet.clock_out_time,
            work_duration_minutes: timesheet.work_duration_minutes,
            session_date: timesheet.session_date || new Date().toISOString().split('T')[0],
            status: timesheet.clock_out_time ? 'clocked_out' : 'clocked_in',
            notes: timesheet.notes,
            created_at: timesheet.created_at,
            updated_at: new Date().toISOString()
          };

          if (existingIds.has(timesheet.id)) {
            timesheetsToUpdate.push(payload);
          } else {
            timesheetsToInsert.push(payload);
          }
        });

      // Process timesheet updates
      if (timesheetsToUpdate.length > 0) {
        console.log('Updating existing timesheets:', timesheetsToUpdate.length);
        const { error: updateError } = await supabase
          .from('employee_timesheets')
          .upsert(timesheetsToUpdate);

          if (updateError) {
            console.error('❌ Error updating timesheets:', updateError);
            return;
          }
        }

      // Handle new timesheets
      if (timesheetsToInsert.length > 0) {
        console.log('Inserting new timesheets:', timesheetsToInsert.length);
        const { error: insertError } = await supabase
          .from('employee_timesheets')
          .insert(timesheetsToInsert);

          if (insertError) {
            console.error('❌ Error inserting timesheets:', insertError);
          return;
          }
        }

        // Mark all as synced
        await localDB.markTimesheetsSynced(unsyncedTimesheets.map(t => t.id));
        console.log('✅ All timesheets synced:', {
          updated: timesheetsToUpdate.length,
          inserted: timesheetsToInsert.length
        });
      } else {
        console.log('No unsynced timesheets found');
      }

      // After successful save, reload latest state from localDB
      const [latestInventory, latestTickets, latestSession] = await Promise.all([
        localDB.getAllInventoryItems ? localDB.getAllInventoryItems() : [],
        localDB.getAllTickets ? localDB.getAllTickets() : [],
        localDB.getSessionByEmployeeAndDate(selectedEmployee, getTodayDate())
      ]);

      // Update stored tickets history
      setAllStoredTickets(latestTickets);
      if (Array.isArray(latestInventory)) {
        setInventoryItems(latestInventory);
        console.log('✅ Reloaded inventoryItems from localDB after save:', latestInventory);
      }
      if (Array.isArray(latestTickets)) {
        setTickets(latestTickets);
        console.log('✅ Reloaded tickets from localDB after save:', latestTickets);
      }
      if (latestSession) {
        setCurrentSession(latestSession);
        setCashData({
          started: latestSession.cash_started || 0,
          added: latestSession.cash_added || 0,
          coinsUsed: latestSession.coins_used || 0,
          total: (latestSession.cash_started || 0) + (latestSession.cash_added || 0) - (latestSession.coins_used || 0)
        });
        setNotes(latestSession.notes || '');
        console.log('✅ Reloaded session/cashData/notes from localDB after save:', latestSession);
      }
      alert('✅ All data saved to Supabase and reloaded from localDB successfully!');
    } catch (err) {
      console.error('❌ Error in handleSave:', err);
      // Show user-friendly error message
      if (!navigator.onLine) {
        alert('No internet connection. Data saved to local storage only.');
      } else if (err.message?.includes('localDB')) {
        alert('Error with local storage. Please try again.');
          } else {
        alert('Error saving data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Save data to local storage only
  const saveToLocal = async (sessionData) => {
      const localSave = {
        employee: selectedEmployee,
        date: new Date().toISOString(),
        data: sessionData,
        timestamp: new Date().getTime()
      };
      
    // Save to localStorage as a backup
      const localSaves = JSON.parse(localStorage.getItem('pos_offline_saves') || '[]');
      localSaves.push(localSave);
      localStorage.setItem('pos_offline_saves', JSON.stringify(localSaves));
    
    return localSave;
  };

      // Load stored tickets and keep updated
  useEffect(() => {
    const loadStoredTickets = async () => {
      try {
        const storedTickets = await localDB.getAllTickets();
        // Filter out empty template tickets
        const validTickets = storedTickets.filter(ticket => 
          ticket.id !== 'message' && // Keep message tickets
          (ticket.ticketNumber || ticket.ticket_number) && // Has a number
          ((ticket.wash > 0 || ticket.dry > 0) || // Has amounts in new format
           (ticket.wash_amount > 0 || ticket.dry_amount > 0)) // Has amounts in old format
        );
        
        // Sort by creation date, newest first
        const sortedTickets = validTickets.sort((a, b) => {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          return dateB - dateA;
        });
        
        setAllStoredTickets(sortedTickets);
        console.log('✅ Loaded stored tickets:', sortedTickets);
      } catch (error) {
        console.error('Error loading stored tickets:', error);
      }
    };
    loadStoredTickets();
  }, []);

  // Initialize state from localDB if available
  useEffect(() => {
    let isMounted = true;
    const initializeFromLocalDB = async () => {
      await localDB.ready;
      
      // Load all tickets for history first
      const allStoredTickets = await localDB.getAllTickets();
      // Filter tickets for current session
      const sessionTickets = allStoredTickets.filter(ticket => 
        ticket.pos_session_id === currentSession?.id &&
        ticket.id !== 'message' &&
        (ticket.ticketNumber || ticket.ticket_number) &&
        ((ticket.wash > 0 || ticket.dry > 0) ||
         (ticket.wash_amount > 0 || ticket.dry_amount > 0))
      ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setAllStoredTickets(sessionTickets);
      console.log('Loaded all tickets for history on init:', sessionTickets);
      
      // Load employees from localDB
      const localEmployees = await localDB.getAllEmployees();
      if (localEmployees?.length > 0) {
        setEmployeeList(localEmployees);
      }

      // Only load session data if we have a selected employee
      if (selectedEmployee) {
        // Get today's session for the selected employee
        const session = await localDB.getSessionByEmployeeAndDate(selectedEmployee, getTodayDate());
        console.log('Loading session for employee:', selectedEmployee, session);
        
        if (session) {
          // Set session data
          setCurrentSession(session);
          // Store session ID in localStorage
          localStorage.setItem('current_session_id', session.id);
          
          // Set cash data
          setCashData({
            started: session.cash_started || 0,
            added: session.cash_added || 0,
            coinsUsed: session.coins_used || 0,
            total: (session.cash_started || 0) + (session.cash_added || 0) - (session.coins_used || 0)
          });
          
          // Set notes
          setNotes(session.notes || '');

      // Load all tickets for history view
      const allStoredTickets = await localDB.getAllTickets();
      setAllStoredTickets(allStoredTickets);
      console.log('Loaded all tickets for history:', allStoredTickets);

      // Load inventory and tickets for this session
      const localInventory = await localDB.getAllInventoryItems();
      const sessionInventory = localInventory.filter(item => item.pos_session_id === session.id);
      if (sessionInventory.length > 0) {
        setInventoryItems(sessionInventory);
      } else {
              // If no session inventory, get the latest inventory state from localDB
            const allInventory = await localDB.getAllInventoryItems();
            console.log('Retrieved all inventory for initialization:', allInventory);
            
            // Create a map of the latest state for each item
            const latestInventoryMap = {};
            allInventory.forEach(item => {
              if (item.name) {
                const key = item.name.toLowerCase();
                if (!latestInventoryMap[key] || 
                    new Date(item.created_at || 0) > new Date(latestInventoryMap[key].created_at || 0)) {
                  latestInventoryMap[key] = item;
                }
              }
            });
            
            // First try to get unique items from localDB to create structure
            const uniqueItems = Array.from(new Set(allInventory.map(item => item.name)))
              .filter(name => name) // Filter out null/undefined names
              .map(name => {
                const item = allInventory.find(i => i.name === name);
                return {
                  id: item.id,
                  item_name: name,
                  quantity: item.qty,
                  price: item.price
                };
              });

            let inventoryStructure = [];
            
            // If we have items in localDB, use those
            if (uniqueItems.length > 0) {
              inventoryStructure = uniqueItems;
              console.log('Using inventory structure from localDB:', uniqueItems);
            }
            // If online, try to get from Supabase
            else if (navigator.onLine) {
              try {
                const { data: masterInventory } = await supabase.from('master_inventory_items').select('*');
                if (masterInventory?.length > 0) {
                  inventoryStructure = masterInventory;
                  console.log('Using inventory structure from Supabase:', masterInventory);
                }
              } catch (error) {
                console.log('Failed to fetch master inventory (offline mode):', error);
                // In case of error, fall back to local structure if available
                if (uniqueItems.length > 0) {
                  inventoryStructure = uniqueItems;
                  console.log('Falling back to local inventory structure:', uniqueItems);
                }
              }
            }

            // If we have any inventory structure, use it
            if (inventoryStructure.length > 0) {
              const defaultInventory = inventoryStructure.map(item => {
                const latestItem = latestInventoryMap[item.item_name?.toLowerCase() || item.name?.toLowerCase()];
                return {
                  id: item.id,
                  name: item.item_name || item.name,
                  qty: item.quantity || latestItem?.qty || 1,
                  price: Number(item.price || latestItem?.price || 0),
                  start: latestItem?.left || latestItem?.start || 0,
                  add: 0,
                  sold: 0,
                  left: latestItem?.left || latestItem?.start || 0,
                  total: 0,
                  pos_session_id: session.id
                };
              });
              
              console.log('Initializing inventory with latest values:', {
                latest: latestInventoryMap,
                new: defaultInventory
              });
              
              setInventoryItems(defaultInventory);
              // Store the initialized inventory
              await localDB.storeInventoryItems(defaultInventory);
            } else {
              setInventoryItems([]);
            }
          }

          const localTickets = await localDB.getAllTickets();
          const sessionTickets = localTickets.filter(ticket => ticket.pos_session_id === session.id);
          if (sessionTickets.length > 0) {
            setTickets(sessionTickets);
          } else {
            // Create default tickets with session ID
            const defaultTickets = [
              { id: 1, ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: session.id },
              { id: 2, ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: session.id },
              { id: 3, ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: session.id }
            ];
            setTickets(defaultTickets);
            // Store the default tickets
            await localDB.storeTickets(defaultTickets);
          }
        } else {
          // No session found, create a new one
          const newSession = {
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            session_date: getTodayDate(),
            employee_id: selectedEmployee,
            status: 'active',
            notes: '',
            cash_started: 0,
            cash_added: 0,
            coins_used: 0,
            cash_total: 0,
            inventory_total: 0,
            wash_dry_total: 0,
            grand_total: 0
          };
          await localDB.storeSession(newSession);
          setCurrentSession(newSession);
          localStorage.setItem('current_session_id', newSession.id);
          
          // Set initial state
          setCashData({ started: 0, added: 0, coinsUsed: 0, total: 0 });
          setNotes('');
          setInventoryItems([]);
            const defaultTickets = [
            { id: crypto.randomUUID(), ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: newSession.id },
            { id: crypto.randomUUID(), ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: newSession.id },
            { id: crypto.randomUUID(), ticketNumber: '', wash: 0, dry: 0, total: 0, pos_session_id: newSession.id }
          ];
          await localDB.storeTickets(defaultTickets);
            setTickets(defaultTickets);
        }
      }
    };

    initializeFromLocalDB();
    return () => {
      isMounted = false;
    };
  }, [selectedEmployee]); // Re-run when selected employee changes

  // Helper: Merge master inventory with local/latest inventory
  const mergeMasterWithLocalInventory = async () => {
    // 1. Fetch master inventory items from Supabase
    let masterProducts = [];
    try {
      const { data: masterData, error: masterError } = await supabase
        .from('master_inventory_items')
        .select('*')
        .order('item_name');
      if (masterError) throw masterError;
      masterProducts = (masterData || []).map(item => ({
        id: item.id,
        name: item.item_name,
        price: Number(item.price || 0),
        qty: item.quantity || 1
      }));
    } catch (e) {
      console.error('Error fetching master product list:', e);
      return; // Don't update inventory if master fetch fails
    }
    // 2. Fetch latest local inventory records
    let localInventory = [];
    if (localDB.getAllInventoryItems) {
      localInventory = await localDB.getAllInventoryItems();
    }
    const inventoryByProduct = {};
    for (const item of localInventory) {
      const key = (item.name || item.item_name || '').toLowerCase();
      if (!inventoryByProduct[key] ||
          new Date(item.updated_at || item.created_at || 0) > new Date(inventoryByProduct[key].updated_at || inventoryByProduct[key].created_at || 0)) {
        inventoryByProduct[key] = item;
      }
    }
    // 3. Merge: for each master item, use local record if exists, else zero/defaults
    const displayInventory = masterProducts.map(prod => {
      const key = prod.name.toLowerCase();
      const inv = inventoryByProduct[key];
      return inv ? {
        ...inv,
        id: prod.id, // Always use the unique id from Supabase
        name: prod.name,
        price: prod.price,
        qty: prod.qty
      } : {
        id: prod.id,
        name: prod.name,
        price: prod.price,
        qty: prod.qty,
        start: 0,
        add: 0,
        sold: 0,
        left: 0,
        total: 0
      };
    });
    setInventoryItems(displayInventory);
    console.log('Display inventory (master + latest local):', displayInventory);
  };

  // On mount, restore cashData from localDB session if available
  useEffect(() => {
    const loadCashData = async () => {
      if (selectedEmployee) {
        const session = await localDB.getSessionByEmployeeAndDate(selectedEmployee, getTodayDate());
        if (session && (session.cash_started !== undefined || session.cash_added !== undefined)) {
          setCashData({
            started: session.cash_started || 0,
            added: session.cash_added || 0,
            coinsUsed: session.coins_used || 0,
            total: (session.cash_started || 0) + (session.cash_added || 0) - (session.coins_used || 0)
          });
          console.log('Restored cash data from localDB:', session);
        }
      }
    };
    loadCashData();
  }, [selectedEmployee]);

  // Helper to get last ticket number from Supabase and store in localStorage
  const updateLastTicketNumberFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('pos_wash_dry_tickets')
        .select('ticket_number')
        .order('ticket_number', { ascending: false })
        .limit(1)
              .single();
      const lastTicketNumber = data?.ticket_number ? parseInt(data.ticket_number, 10) : 0;
      localStorage.setItem('last_ticket_number', lastTicketNumber);
      return lastTicketNumber;
    } catch (e) {
      console.error('Failed to fetch last ticket number from Supabase:', e);
      return parseInt(localStorage.getItem('last_ticket_number') || '0', 10);
    }
  };

  // Ticket numbers are managed through Save Progress button only

  // At the top of EmployeePOSTerminal (inside the component):
  useEffect(() => {
    // On mount, check if localDB has employees and skip prompt if so
    (async () => {
      if (localDB.getAllEmployees) {
        await localDB.ready;
        const localEmployees = await localDB.getAllEmployees();
        if (localEmployees && localEmployees.length > 0) {
          setEmployeeList(localEmployees);
          setLoadingEmployees(false);
        }
      }
    })();
  }, []);

  // No automatic localDB check on page visit - everything happens through Save Progress button

  // Helper to get today's date in YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  if (loading && !currentSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading employee data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Header />
      {/* Add admin login notification */}
      <div className="bg-blue-50 border-b border-blue-200 p-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-sm text-blue-700">Employee Terminal - No login required for employees</span>
          <a 
            href="/admin-login" 
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Admin Login
          </a>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mx-6 mt-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Icon name="AlertCircle" size={20} className="text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="text-red-700 hover:text-red-900 text-sm underline mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex h-[calc(100vh-6rem)]">
        {/* Main POS Area - 70% width */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header Section */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-blue-600 rounded-xl shadow-lg">
                    <Icon name="Monitor" size={24} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-800">POS System</h1>
                    <p className="text-slate-600">Employee Terminal</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {/* Clock Status Indicator */}
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full animate-pulse ${clockStatus === 'clocked-in' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-sm text-slate-600">
                      {clockStatus === 'clocked-in' ? 'Clocked In' : 'Clocked Out'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Employee Name</label>
                  <div className="relative">
                      <EmployeeSelect
                        employees={employeeList}
                        selectedEmployeeId={selectedEmployee}
                        onChange={handleEmployeeChange}
                      />
                    </div>
                  {!loadingEmployees && employeeList?.length === 0 && (
                    <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      <Icon name="AlertTriangle" size={16} className="inline mr-2" />
                      No employees loaded.
                    </p>
                  )}
                  {!loadingEmployees && employeeList?.length > 0 && (
                    <p className="text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                      <Icon name="Info" size={16} className="inline mr-2" />
                      Please select employee.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Session Date</label>
                  <input
                    type="text"
                    value={sessionDate}
                    readOnly
                    className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl cursor-not-allowed text-slate-600"
                    placeholder="DD/MM/YYYY"
                  />
                </div>
              </div>

              {/* Enhanced Clock In/Out Buttons with employee validation */}
              <div className="flex items-center justify-center space-x-4">
                <button
                  onClick={handleClockIn}
                  disabled={clockStatus === 'clocked-in' || loading || (!selectedEmployee && !user?.id)}
                  className={`px-8 py-3 rounded-xl font-semibold transition-all flex items-center space-x-2 ${
                    clockStatus === 'clocked-in' || loading || (!selectedEmployee && !user?.id)
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                  }`}
                >
                  <Icon name="Clock" size={20} />
                  <span>{loading ? 'Processing...' : 'Clock In'}</span>
                </button>
                
                <button
                  onClick={handleClockOut}
                  disabled={clockStatus === 'clocked-out' || loading || (!selectedEmployee && !user?.id)}
                  className={`px-8 py-3 rounded-xl font-semibold transition-all flex items-center space-x-2 ${
                    clockStatus === 'clocked-out' || loading || (!selectedEmployee && !user?.id)
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :'bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                  }`}
                >
                  <Icon name="Clock" size={20} />
                  <span>{loading ? 'Processing...' : 'Clock Out'}</span>
                </button>
                
                {clockTime && clockStatus === 'clocked-in' && (
                  <div className="text-sm text-slate-600 bg-slate-100 px-4 py-2 rounded-lg">
                    Started: {clockTime?.toLocaleTimeString()}
                  </div>
                )}
                
                {/* Employee selection reminder */}
                {!selectedEmployee && !user?.id && (
                  <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-center">
                    <Icon name="AlertTriangle" size={14} className="mr-1" />
                    Select employee to enable clock-in/out
                  </div>
                )}
              </div>
            </div>

            {/* Enhanced Inventory Section with sync status */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Icon name="Package" size={20} className="text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-slate-800">Inventory Management</h2>
                  <p className="text-sm text-slate-600">Items synced in real-time from admin master inventory</p>
                </div>
              </div>
              <InventoryGrid 
                items={inventoryItems}
                onFieldClick={handleFieldClick}
                activeInput={activeInput}
                getDisplayValue={getDisplayValue}
              />
            </div>

            {/* Wash & Dry Tickets Section */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-cyan-100 rounded-lg">
                  <Icon name="Ticket" size={20} className="text-cyan-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800">Wash & Dry Tickets</h2>
              </div>
              {/* Ticket History */}
              <TicketHistory 
                tickets={allStoredTickets || []}
                pageSize={10}
              />
              {/* Debug output */}
              {process.env.NODE_ENV === 'development' && (
                <div className="hidden">
                  <pre>{JSON.stringify({ allStoredTickets }, null, 2)}</pre>
                </div>
              )}
              
              {/* Current Ticket Input */}
              <TicketInput 
                ticket={tickets[0]}
                onTicketNumberChange={(value) => {
                  setCurrentInputValue(value);
                  handleFieldChange('ticketNumber', value, tickets[0].id);
                }}
                onWashChange={(value) => {
                  setCurrentInputValue(value);
                  handleFieldChange('wash', value, tickets[0].id);
                }}
                onDryChange={(value) => {
                  setCurrentInputValue(value);
                  handleFieldChange('dry', value, tickets[0].id);
                }}
                isInputMode={isInputMode}
                activeInput={activeInput}
                currentInputValue={currentInputValue}
                onInputClick={(field) => {
                  setIsInputMode(true);
                  setActiveInput(field);
                  setCurrentInputValue(tickets[0][field]?.toString() || '');
                }}
                onInputBlur={() => {
                  setTimeout(() => {
                    setIsInputMode(false);
                    setActiveInput(null);
                  }, 100);
                }}
                onInsert={handleInsertTicket}
                loading={loading}
              />
            </div>

            {/* Bottom Row: Cash Section, Totals, Notes */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <CashSection 
                cashData={cashData}
                onFieldClick={handleFieldClick}
                activeInput={activeInput}
                getDisplayValue={getDisplayValue}
              />
              <TotalsSection totals={totals} />
              <NotesSection notes={notes} setNotes={setNotes} />
            </div>
          </div>
        </div>

        {/* Numpad Area - 30% width */}
        <div className="w-80 bg-white/90 backdrop-blur-sm border-l border-slate-200 p-6">
          <Numpad 
            onNumberClick={handleNumberInput}
            onDecimalClick={handleDecimalInput}
            onClear={handleClear}
            onEnter={handleEnter}
            onSave={handleSave}
            activeInput={activeInput}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default EmployeePOSTerminal;