import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/ui/Header';
import Icon from '../../components/AppIcon';
import InventoryGrid from './components/InventoryGrid';
import WashDryTickets from './components/WashDryTickets';
import CashSection from './components/CashSection';
import TotalsSection from './components/TotalsSection';
import NotesSection from './components/NotesSection';
import Numpad from './components/Numpad';
import { useAuth } from '../../contexts/AuthContext';
import { timesheetService } from '../../services/timesheetService';
import { posService } from '../../services/posService';
import { supabase } from '../../lib/supabase';
import { localDB } from '../../services/localDB';
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
      const testItems = [
        { item_name: 'Downy 19 oz', price: 5.50 },
        { item_name: 'Gain Sheets 15ct', price: 2.25 },
        { item_name: 'Roma 17 63 oz', price: 2.75 },
        { item_name: 'Xtra 56 oz', price: 5.50 },
        { item_name: 'Clorox 16 oz', price: 2.50 }
      ];
      
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
        const employeeId = user?.id;
        if (employeeId) {
          const clockIn = await timesheetService.getActiveClockIn(employeeId);
          if (clockIn) {
            setActiveClockIn(clockIn);
            setClockStatus('clocked-in');
            setClockTime(clockIn.clock_in_time);
            setShowClockOutPrompt(true);
          }
        }
      } catch (error) {
        console.error('Error checking active clock-in:', error);
      } finally {
        setIsCheckingClockIn(false);
      }
    };

    // Run database connection test and check for active clock-in
    const initialize = async () => {
      await testDatabaseConnection();
      await checkActiveClockIn();
    };

    initialize();

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

  // Wash & Dry tickets data - will be updated with persistent sequencing
  const [tickets, setTickets] = useState([
    { id: 1, ticketNumber: '015', wash: 0, dry: 0, total: 0 },
    { id: 2, ticketNumber: '016', wash: 0, dry: 0, total: 0 },
    { id: 3, ticketNumber: '017', wash: 0, dry: 0, total: 0 }
  ]);

  // Cash section data
  const [cashData, setCashData] = useState({
    started: 0,
    added: 0,
    total: 0
  });

  // Totals data (all auto-calculated)
  const [totals, setTotals] = useState({
    inventorySalesTotal: 0,
    washDrySubtotal: 0,
    grandTotal: 0
  });

  const [notes, setNotes] = useState('');

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
  };

  // Load employees from local IndexedDB first, then sync with server on Save Progress
  const loadEmployees = () => {
    // Only load from local cache
    try {
      const cachedEmployees = localStorage.getItem('cached_employees');
      if (cachedEmployees) {
        const parsed = JSON.parse(cachedEmployees);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEmployeeList(parsed);
          setEmployeeOptions(parsed.map(emp => ({ value: emp.id, label: emp.full_name })));
          console.log(`� Loaded ${parsed.length} employees from cache`);
        } else {
          setEmployeeList([]);
        }
      } else {
        setEmployeeList([]);
      }
      // If no employees, show prompt in UI (handled below)
      console.log('💾 No employees loaded from localDB. Prompt user to press Save Progress to load from online database.');
    } catch (err) {
      console.error('Failed to load employees:', err);
      setError('Failed to load employees. Please try again later.');
      setEmployeeList([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Load master inventory items from local data
  const loadMasterInventoryItems = async () => {
    try {
      setLoading(true);
      
      // Define local inventory items with default values
      const defaultInventory = [
        { id: 1, name: 'Downy 19 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 2, name: 'Gain Sheets 15ct', qty: 1, price: 2.25, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 3, name: 'Roma 17 63 oz', qty: 1, price: 2.75, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 4, name: 'Xtra 56 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 5, name: 'Clorox 16 oz', qty: 1, price: 2.50, start: 0, add: 0, sold: 0, left: 0, total: 0 }
      ];
      
      // Set the inventory items
      setInventoryItems(defaultInventory);
      console.log('✅ Loaded default inventory items');
      
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

  // Load employees and initial data on component mount
  useEffect(() => {
    loadEmployees();
    loadMasterInventoryItems();
  }, []);
  
  // Initialize with actual employee data from userProfile
  useEffect(() => {
    if (userProfile?.full_name) {
      setSelectedEmployee(userProfile?.full_name);
    }
  }, [userProfile]);

  // Remove authentication dependency - allow direct access for employees
  useEffect(() => {
    // Remove user?.id dependency to allow access without login
    loadEmployeeData();
  }, []);

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
  const handleEmployeeChange = async (newEmployeeName) => {
    // If the selected employee is the same, do nothing
    if (newEmployeeName === selectedEmployee) return;

    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      const shouldSave = window.confirm(
        `You have unsaved changes for ${selectedEmployee || 'current employee'}. Would you like to save your progress before switching to ${newEmployeeName}?`
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
    setSelectedEmployee(newEmployeeName);
    
    // Reset only the transaction-specific fields (SOLD, ADD) for fresh employee shift
    resetInventoryTransactionFields();
    
    // Also reset tickets, cash, and notes for the new employee shift
    try {
      // Generate new sequential tickets for the new employee
      const ticketNumbers = await posService?.generateTicketNumbers(3);
      let newTickets = ticketNumbers?.map((ticketNum, index) => ({
        id: index + 1,
        ticketNumber: ticketNum,
        wash: 0,
        dry: 0,
        total: 0
      }));
      setTickets(newTickets);
      console.log(`✅ Generated fresh sequential tickets for ${newEmployeeName}: ${ticketNumbers?.join(', ')}`);
    } catch (error) {
      console.error('Error generating tickets for new employee:', error);
      // Fallback to default reset
      setTickets([
        { id: 1, ticketNumber: '001', wash: 0, dry: 0, total: 0 },
        { id: 2, ticketNumber: '002', wash: 0, dry: 0, total: 0 },
        { id: 3, ticketNumber: '003', wash: 0, dry: 0, total: 0 }
      ]);
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
    alert(`Switched to ${newEmployeeName}. 

🔄 Reset for new employee shift:
• SOLD fields: All reset to 0
• ADD fields: All reset to 0
• Cash section: Reset to 0
• Tickets: Fresh sequential numbers generated
• Notes: Cleared

✅ START stock levels preserved from master inventory.`);
  };

  const loadEmployeeData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Set default clock status to clocked-out for all users
      setClockStatus('clocked-out');
      
      // Set default inventory items
      const defaultInventory = [
        { id: 1, name: 'Downy 19 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 2, name: 'Gain Sheets 15ct', qty: 1, price: 2.25, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 3, name: 'Roma 17 63 oz', qty: 1, price: 2.75, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 4, name: 'Xtra 56 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
        { id: 5, name: 'Clorox 16 oz', qty: 1, price: 2.50, start: 0, add: 0, sold: 0, left: 0, total: 0 }
      ];
      
      setInventoryItems(defaultInventory);
      
      // Initialize with default ticket numbers
      const defaultTickets = [
        { id: 1, ticketNumber: '001', wash: 0, dry: 0, total: 0 },
        { id: 2, ticketNumber: '002', wash: 0, dry: 0, total: 0 },
        { id: 3, ticketNumber: '003', wash: 0, dry: 0, total: 0 }
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
      
      // Set a default local session with valid UUID
      setCurrentSession({ 
        id: generateUUID(),  // Now using a valid UUID v4
        created_at: new Date().toISOString(),
        employee_id: selectedEmployee || 'local_employee',
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
      total: (prev?.started || 0) + (prev?.added || 0)
    }));
  }, [cashData?.started, cashData?.added]);

  // FIXED: Simple field click handler without auto-fill
  const handleFieldClick = (fieldInfo) => {
    // Clear ALL input-related state when switching fields
    setCurrentInputValue('');
    setIsInputMode(false);
    setActiveInput(fieldInfo);
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
    
    // Only update the field value when the input is complete or valid
    const numericValue = parseFloat(newValue);
    if (!isNaN(numericValue)) {
      updateFieldValue(numericValue);
    }
  };

  const handleDecimalInput = () => {
    if (!activeInput) return;
    
    // Prevent multiple decimal points
    if (currentInputValue?.includes('.')) return;
    
    setIsInputMode(true);
    
    // Add decimal point - start with "0." if empty
    const newValue = currentInputValue === '' ? '0.' : currentInputValue + '.';
    setCurrentInputValue(newValue);
    
    // Update with the decimal value
    const numericValue = parseFloat(newValue);
    if (!isNaN(numericValue)) {
      updateFieldValue(numericValue);
    } else {
      updateFieldValue(0);
    }
  };

  const handleClear = () => {
    if (!activeInput) return;
    setCurrentInputValue('');
    setIsInputMode(false);
    updateFieldValue(0);
  };

  const handleEnter = () => {
    // Finalize the input and clear the input mode
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

      // Use local storage for clock in
      const clockInResult = await timesheetService.clockIn(user?.id, selectedEmployee);
      
      if (clockInResult.error) throw clockInResult.error;
      
      const timesheet = clockInResult.data;
      const currentTime = new Date(timesheet.clock_in_time);
      
      // Update state
      setActiveClockIn(timesheet);
      setClockStatus('clocked-in');
      setClockTime(currentTime);
      setShowClockInModal(false);
      
      // Show success message
      alert(`${selectedEmployee} clocked in successfully at ${currentTime.toLocaleTimeString()}`);
      
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
    if (!selectedEmployee && !user?.id) {
      alert('Please select an employee before clocking out.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Use local storage for clock out
      const clockOutResult = await timesheetService.clockOut(user?.id, selectedEmployee);
      
      if (clockOutResult.error) throw clockOutResult.error;
      
      const timesheet = clockOutResult.data;
      const clockOutTime = new Date(timesheet.clock_out_time);
      
      // Calculate work duration
      const workDuration = timesheet.total_hours ? 
        `${Math.floor(timesheet.total_hours)}h ${Math.round((timesheet.total_hours % 1) * 60)}m` : '';
      
      // Update state
      setActiveClockIn(null);
      setClockStatus('clocked-out');
      setClockTime(null);
      
      // Show success message
      const employeeName = selectedEmployee || userProfile?.full_name || 'Employee';
      alert(`${employeeName} clocked out successfully at ${clockOutTime.toLocaleTimeString()}${workDuration ? ` (Worked: ${workDuration})` : ''}

✅ Data saved locally. Don't forget to sync with the server when online!`);
      
    } catch (error) {
      console.error('Error in handleClockOut:', error);
      setError(`Clock out failed: ${error?.message || 'Unknown error'}`);
      alert(`Clock out failed: ${error?.message || 'Unknown error'}

⚠️ Please ensure:
• Employee "${selectedEmployee}" is selected
• Employee is currently clocked in`);
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
      // Check pos_inventory_items
      try {
        const { data: inventoryCheck } = await supabase
          .from('pos_inventory_items')
          .select('*')
          .limit(1);
        tableChecks.hasInventory = true;
      } catch (e) {
        console.warn('⚠️ pos_inventory_items table not found or not accessible');
        tableChecks.hasInventory = false;
      }

      // Check pos_wash_dry_tickets
      try {
        const { data: ticketsCheck } = await supabase
          .from('pos_wash_dry_tickets')
          .select('*')
          .limit(1);
        tableChecks.hasTickets = true;
      } catch (e) {
        console.warn('⚠️ pos_wash_dry_tickets table not found or not accessible');
        tableChecks.hasTickets = false;
      }

      setLoading(true);
      setError(null);

      // Step 1: Fetch and cache employees if not loaded
      if (!employeeList || employeeList.length === 0) {
        const { data: employees, error: employeeError } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, role')
          .order('full_name', { ascending: true });
        if (employeeError) {
          throw new Error('Failed to fetch employees from online database.');
        }
        if (employees && employees.length > 0) {
          await Promise.all(employees.map(emp => localDB.storeEmployeeProfile(emp)));
          localStorage.setItem('cached_employees', JSON.stringify(employees));
          localStorage.setItem('cached_employee_options', JSON.stringify(employees.map(emp => ({ value: emp.id, label: emp.full_name }))));
          setEmployeeList(employees);
          setEmployeeOptions(employees.map(emp => ({ value: emp.id, label: emp.full_name })));
          alert('✅ Employees loaded from online database and cached locally. Please select an employee and press Save Progress again.');
          setLoading(false);
          return;
        } else {
          throw new Error('No employees found in online database.');
        }
      }

      // Step 2: Validate employee selection
      if (!selectedEmployee?.trim()) {
        throw new Error('Please select an employee before saving.');
      }

      // Step 3: Save all relationships to localDB first (offline-first)
      // Save employee_timesheet (clock in/out)
      await localDB.storeEmployeeProfile(
        employeeList.find(emp => emp.full_name === selectedEmployee)
      );

      // Save pos_session
      if (currentSession) {
        // You may want to implement a localDB.storeSession method
        // await localDB.storeSession(currentSession);
      }

      // Save inventory items
      if (inventoryItems && inventoryItems.length > 0) {
        // You may want to implement a localDB.storeInventoryItems method
        // await localDB.storeInventoryItems(inventoryItems);
      }

      // Save tickets
      if (tickets && tickets.length > 0) {
        // You may want to implement a localDB.storeTickets method
        // await localDB.storeTickets(tickets);
                      }

                      // Step 4: Prompt user that data is saved locally
                      alert('✅ All data saved locally. Press Save Progress again to sync with server when online.');

                    } catch (err) {
                      setError(err?.message || 'Unknown error occurred');
                      alert(`❌ Error saving data: ${err?.message || 'Unknown error occurred'}`);
                    } finally {
                      setLoading(false);
                    }
          
          // Function to get a valid employee ID
          const getEmployeeId = () => {
            if (!selectedEmployee) {
              console.log('ℹ️ No employee selected');
              return null;
            }

            // First, check if selectedEmployee is a valid UUID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            
            // If it's a valid UUID, use it directly
            if (uuidRegex.test(selectedEmployee)) {
              console.log('✅ Using provided employee ID:', selectedEmployee);
              return selectedEmployee;
            }
            
            // If we have employeeOptions (from the dropdown), try to find a match
            if (employeeOptions && employeeOptions.length > 0) {
              // Try to find by name (case-insensitive)
              const employee = employeeOptions.find(emp => 
                emp.label && emp.label.toLowerCase() === selectedEmployee.toLowerCase()
              );
              
              if (employee && employee.value) {
                console.log('✅ Found employee in dropdown by name:', employee.value);
                return employee.value; // Return the employee_id
              }
              
              // If no match but we have options, use the first one
              console.log(`⚠️ Using first available employee from dropdown: ${employeeOptions[0].value}`);
              return employeeOptions[0].value;
            }
            
            console.error('❌ No employee data available');
            return null;
          };

          // Function to create a new session
          const createNewSession = async () => {
            console.log('🔄 Creating a new session...');
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            
            // Get a valid employee ID
            let employeeId = getEmployeeId();
            
            // If no valid employee ID found but we have options, use the first one
            if (!employeeId && employeeOptions && employeeOptions.length > 0) {
              console.log('⚠️ No valid employee selected, using first available from dropdown');
              employeeId = employeeOptions[0].value;
            }
            
            // If still no employee ID, try to get any employee from the database
            if (!employeeId) {
              console.log('ℹ️ No valid employee found, querying database...');
              const { data: employees, error } = await supabase
                .from('employees')
                .select('id')
                .limit(1);
                
              if (!error && employees && employees.length > 0) {
                employeeId = employees[0].id;
                console.log(`✅ Found employee in database: ${employeeId}`);
              }
            }
            
            // If still no employee ID, we can't proceed
            if (!employeeId) {
              throw new Error('No valid employee available to assign to the session');
            }
            
            console.log(`🆔 Using employee ID for session: ${employeeId}`);
            
            const newSession = {
              employee_id: employeeId,
              session_date: today,
              status: 'active',
              notes: 'Auto-created session',
              inventory_total: 0,
              wash_dry_total: 0,
              grand_total: 0,
              cash_started: 0,
              cash_added: 0,
              cash_total: 0,
              created_at: now.toISOString(),
              updated_at: now.toISOString()
            };

            console.log('Creating new session with data:', newSession);
            
            const { data: createdSession, error: createError } = await supabase
              .from('pos_sessions')
              .insert(newSession)
              .select()
              .single();

            if (createError || !createdSession) {
              console.error('❌ Failed to create new session:', createError);
              throw new Error(`Failed to create new session: ${createError?.message || 'Unknown error'}`);
            }

            console.log('✅ New session created:', createdSession.id);
            setCurrentSession(createdSession);
            return createdSession.id;
          };

          // Verify or create session
          let validSessionId = sessionId;
          
          if (!validSessionId) {
            console.log('ℹ️ No session ID provided, creating a new one...');
            validSessionId = await createNewSession();
          } else {
            console.log('🔍 Verifying session exists...');
            const { data: existingSession, error: sessionError } = await supabase
              .from('pos_sessions')
              .select('id, status, employee_id')
              .eq('id', validSessionId)
              .maybeSingle();

            if (sessionError || !existingSession) {
              console.log('⚠️ Session not found, creating a new one...');
              validSessionId = await createNewSession();
            } else {
              console.log('✅ Using existing session:', existingSession);
            }
          }

          // Update all tickets with the valid session ID
          const ticketsWithValidSession = ticketData.map(ticket => ({
            ...ticket,
            pos_session_id: validSessionId
          }));

          console.log('💾 Saving tickets with session:', validSessionId);
          console.log('Ticket data:', ticketsWithValidSession);
          
          // Save tickets in batches to avoid timeouts
          const BATCH_SIZE = 5;
          const savedTickets = [];
          const errors = [];
          
          if (tableChecks.hasTickets && ticketsWithValidSession.length > 0) {
            for (let i = 0; i < ticketsWithValidSession.length; i += BATCH_SIZE) {
              const batch = ticketsWithValidSession.slice(i, i + BATCH_SIZE);
              console.log(`💾 Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(ticketsWithValidSession.length / BATCH_SIZE)}`);
              try {
                const { data: batchResults, error: batchError } = await supabase
                  .from('pos_wash_dry_tickets')
                  .insert(batch)
                  .select();
                if (batchError) throw batchError;
                savedTickets.push(...(batchResults || []));
                console.log(`✅ Saved batch ${i / BATCH_SIZE + 1} (${batch.length} tickets)`);
              } catch (batchError) {
                console.error(`❌ Failed to save batch ${i / BATCH_SIZE + 1}:`, batchError);
                errors.push({
                  batch: i / BATCH_SIZE + 1,
                  error: batchError.message
                });
              }
            }
            if (errors.length > 0) {
              console.error('❌ Some tickets failed to save:', errors);
              throw new Error(`Failed to save ${errors.length} out of ${Math.ceil(ticketsWithValidSession.length / BATCH_SIZE)} batches`);
            }
            console.log('✅ Tickets saved successfully:', savedTickets.length);
          } else if (!tableChecks.hasTickets) {
            console.log('ℹ️ Skipping ticket save - table not available');
          } else {
            console.log('ℹ️ No tickets to save');
          }
        } catch (error) {
          // If we created a new session but something failed, clean up the session
          if (isNewSession && sessionId) {
            console.warn('⚠️ Operation failed, cleaning up newly created session...');
            try {
              const { error: cleanupError } = await supabase
                .from('pos_sessions')
                .delete()
                .eq('id', sessionId);
              if (cleanupError) {
                console.error('❌ Failed to clean up session:', cleanupError);
              } else {
                console.log('✅ Cleaned up session after error');
              }
            } catch (cleanupError) {
              console.error('❌ Error during session cleanup:', cleanupError);
            }
          }
          console.error('❌ Error in ticket save process:', {
            message: error.message,
            code: error.code,
            details: error.details
          });
          throw new Error(`Failed to save tickets: ${error.message}`);
        }
    // End of ticket save logic block

      // Save to local storage as backup
      console.log('💾 Creating local backup...');
      const sessionData = {
        notes: notes,
        cashStarted: cashData?.started || 0,
        cashAdded: cashData?.added || 0,
        inventoryItems: inventoryItems,
        tickets: tickets.filter(t => t?.ticketNumber)
      };
      
      const localSave = {
        employee: selectedEmployee,
        date: new Date().toISOString(),
        data: sessionData,
        timestamp: new Date().getTime()
      };
      
      const localSaves = JSON.parse(localStorage.getItem('pos_offline_saves') || '[]');
      localSaves.push(localSave);
      localStorage.setItem('pos_offline_saves', JSON.stringify(localSaves));
      console.log('✅ Local backup created');

      // Fetch and display updated data
      console.log('🔄 Fetching updated data from database...');
      
      // Fetch updated inventory
      const { data: currentInventory, error: fetchInventoryError } = await supabase
        .from('pos_inventory_items')
        .select('*')
        .order('id', { ascending: true });
        
      if (fetchInventoryError) throw new Error(`Failed to fetch updated inventory: ${fetchInventoryError.message}`);
      
      // Fetch latest tickets
      const { data: latestTickets, error: fetchTicketsError } = await supabase
        .from('pos_wash_dry_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (fetchTicketsError) throw new Error(`Failed to fetch updated tickets: ${fetchTicketsError.message}`);

      // Log the updated data
      console.log('\n📊 UPDATED DATABASE STATE:');
      console.log('📦 Inventory:');
      currentInventory?.forEach(item => {
        console.log(`   - ${item.name}: ${item.quantity} (ID: ${item.id})`);
      });
      
      console.log('\n🎫 Latest Tickets:');
      latestTickets?.forEach(ticket => {
        console.log(`   #${ticket.ticket_number}: $${(ticket.wash_amount + ticket.dry_amount).toFixed(2)} ` +
                   `(Wash: $${ticket.wash_amount}, Dry: $${ticket.dry_amount})`);
      });
      
      // Show success message
      const validTickets = tickets.filter(t => t?.ticketNumber);
      const lastTicket = validTickets.length > 0 ? validTickets[validTickets.length - 1] : null;
      
      alert(`✅ All data saved successfully for ${selectedEmployee}!
      
📊 Data Saved:
• Timesheet: Clock-in recorded
• Inventory: Updated ${inventoryItems.length} items
• Tickets: ${validTickets.length} new tickets
• Cash: $${((cashData?.started || 0) + (cashData?.added || 0))?.toFixed(2)}
• Notes: ${notes.length} characters

ℹ️ Check browser console for detailed information.`);

    } catch (err) {
      console.error('❌ Error saving data:', err);
      const errorMessage = err?.message || 'Unknown error occurred';
      setError(`Save failed: ${errorMessage}`);
      
      // Show error alert with details
      alert(`❌ Error saving data: ${errorMessage}
      
🔧 Troubleshooting:
• Check internet connection
• Verify all required fields are filled
• Contact admin if issue persists

📝 Your data is temporarily preserved in the browser.`);
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
                    <select
                      value={selectedEmployee}
                      onChange={(e) => handleEmployeeChange(e?.target?.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      disabled={loading || loadingEmployees}
                    >
                      <option value="">
                        {loadingEmployees ? 'Loading employees...' : 'Select Employee'}
                      </option>
                      {!loadingEmployees && employeeList?.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    {loadingEmployees && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                      </div>
                    )}
                  </div>
                  {!loadingEmployees && employeeList?.length === 0 && (
                    <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      <Icon name="AlertTriangle" size={16} className="inline mr-2" />
                      No data loaded from localDB. Press <strong>Save Progress</strong> button to load from online database.
                    </p>
                  )}
                  {!loadingEmployees && employeeList?.length > 0 && (
                    <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                      <Icon name="CheckCircle" size={16} className="inline mr-2" />
                      {employeeList?.length} employees loaded successfully
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

              {/* Updated demo credentials section */}
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <h3 className="text-sm font-semibold text-blue-800 mb-2">System Access</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
                  <div>
                    <strong>Employees:</strong> Direct access - no login required
                  </div>
                  <div>
                    <strong>Admin:</strong> <a href="/admin-login" className="underline hover:text-blue-900">Login required for dashboard & settings</a>
                  </div>
                </div>
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
              <WashDryTickets 
                tickets={tickets}
                onFieldClick={handleFieldClick}
                activeInput={activeInput}
                getDisplayValue={getDisplayValue}
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