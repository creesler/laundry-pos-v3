import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../components/ui/Header';
import Icon from '../../components/AppIcon';
import InventoryGrid from './components/InventoryGrid';
import WashDryTickets from './components/WashDryTickets';
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
  }

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
  
  // Initialize with actual employee id from userProfile
  useEffect(() => {
    if (userProfile?.id) {
      setSelectedEmployee(userProfile.id);
    }
  }, [userProfile]);

  // Remove authentication dependency - allow direct access for employees
  useEffect(() => {
    // Remove user?.id dependency to allow access without login
    loadEmployeeData();
  }, []);

  // Restore selectedEmployee, inventory, and clock-in state from localStorage/localDB on mount
  useEffect(() => {
    // Restore selectedEmployee
    const savedEmployee = localStorage.getItem('selected_employee');
    if (savedEmployee) {
      setSelectedEmployee(savedEmployee);
      console.log('Restored selectedEmployee from localStorage:', savedEmployee);
    }
    // Fetch master product list from Supabase (now using master_inventory_items)
    (async () => {
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
        console.log('Fetched master product list from Supabase:', masterProducts);
      } catch (e) {
        console.error('Error fetching master product list:', e);
      }
      // Restore inventory from localDB and merge with master list
      if (localDB.getAllInventoryItems) {
        const localInventory = await localDB.getAllInventoryItems();
        const inventoryByProduct = {};
        for (const item of localInventory) {
          const key = (item.name || item.item_name || '').toLowerCase();
          if (!inventoryByProduct[key] ||
              new Date(item.updated_at || item.created_at || 0) > new Date(inventoryByProduct[key].updated_at || inventoryByProduct[key].created_at || 0)) {
            inventoryByProduct[key] = item;
          }
        }
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
            id: prod.id, // Use the unique id even for new items
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
      }
    })();
    // Restore clock-in state
    const savedClockIn = localStorage.getItem('active_clock_in');
    if (savedClockIn) {
      try {
        const parsed = JSON.parse(savedClockIn);
        setActiveClockIn(parsed);
        setClockStatus('clocked-in');
        setClockTime(new Date(parsed.clock_in_time));
        console.log('Restored clock-in state from localStorage:', parsed);
      } catch (e) {
        console.warn('Failed to parse saved clock-in state:', e);
      }
    }
  }, []);

  // Restore notes from localDB on mount
  useEffect(() => {
    if (localDB.getSession) {
      localDB.getSession().then(localSession => {
        if (localSession && localSession.notes) {
          setNotes(localSession.notes);
          console.log('Restored notes from localDB:', localSession.notes);
        }
      });
    }
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

    // Reset inventory for new shift: start = previous left, add/sold/total = 0, left = new start
    setInventoryItems(prev => prev.map(item => {
      const newStart = item.left;
      return {
        ...item,
        start: newStart,   // Carry over the actual stock
        add: 0,
        sold: 0,
        total: 0,
        left: newStart     // left = start + add - sold = start
      };
    }));

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
      console.log(`✅ Generated fresh sequential tickets for ${newEmployeeId}: ${ticketNumbers?.join(', ')}`);
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
    alert(`Switched to new employee. 

🔄 Reset for new employee shift:
• START fields: Set to previous LEFT (actual stock)
• SOLD fields: All reset to 0
• ADD fields: All reset to 0
• Cash section: Reset to 0
• Tickets: Fresh sequential numbers generated
• Notes: Cleared

✅ START stock levels now match previous shift's actual stock.`);

    // Generate a new session ID for the new employee/shift
    const newSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    console.log('Generated new session ID for employee:', newSessionId);
    setCurrentSession({
      id: newSessionId,
      created_at: new Date().toISOString(),
      employee_id: newEmployeeId,
      status: 'active'
    });
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
      
      // ENFORCE: Only create session if selectedEmployee is a valid UUID
      if (!selectedEmployee || typeof selectedEmployee !== 'string' || selectedEmployee.length < 10) {
        alert('Please select a valid employee before starting a session.');
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
      // Fetch the selected employee object from the employee list
      const employeeObj = employeeList.find(emp => emp.id === selectedEmployee);
      console.log('Clock In: selectedEmployee id:', selectedEmployee);
      console.log('Clock In: employee object:', employeeObj);
      if (!employeeObj) {
        throw new Error('Selected employee not found in employee list.');
      }
      // Use the id from the employee object (should be the same as selectedEmployee)
      const clockInResult = await timesheetService.clockIn(employeeObj.id);
      if (clockInResult.error) throw clockInResult.error;
      const timesheet = clockInResult.data;
      const currentTime = new Date(timesheet.clock_in_time);
      // Update state
      setActiveClockIn(timesheet);
      setClockStatus('clocked-in');
      setClockTime(currentTime);
      setShowClockInModal(false);
      // Persist clock-in state
      localStorage.setItem('active_clock_in', JSON.stringify(timesheet));
      localStorage.setItem('selected_employee', selectedEmployee);
      // Show success message
      alert(`${employeeObj.full_name || selectedEmployee} clocked in successfully at ${currentTime.toLocaleTimeString()}`);
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
      // Use local storage for clock out
      const clockOutResult = await timesheetService.clockOut(employeeId);
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
      // Remove persisted clock-in state
      localStorage.removeItem('active_clock_in');
      // Show success message
      const employeeName = employeeId || userProfile?.full_name || 'Employee';
      alert(`${employeeName} clocked out successfully at ${clockOutTime.toLocaleTimeString()}${workDuration ? ` (Worked: ${workDuration})` : ''}\n\n✅ Data saved locally. Don't forget to sync with the server when online!`);
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
    console.log('Save Progress button pressed - handleSave called');
    if (!navigator.onLine) {
      alert('No internet detected. Saving to localDB for now. Try saving later when you have wifi connection.');
      // Add note to session if possible
      if (localDB.storeSession && currentSession) {
        const sessionToSave = {
          ...currentSession,
          notes: (notes ? notes + '\n' : '') + 'No internet detected, saving to localDB for now. Try saving later when you have wifi connection.',
          inventory_total: totals.inventorySalesTotal,
          wash_dry_total: totals.washDrySubtotal,
          grand_total: totals.grandTotal,
          cash_started: cashData.started,
          cash_added: cashData.added,
          cash_total: cashData.total
        };
        console.log('Saving session to localDB (offline):', sessionToSave);
        await localDB.storeSession(sessionToSave);
        console.log('Saved session with notes and totals/cash to localDB (offline):', sessionToSave);
      }
      return;
    }
    let tableChecks = { hasInventory: false, hasTickets: false };
    try {
      await localDB.ready;
      // 1. Employees
      const localEmployees = await localDB.getAllEmployees ? await localDB.getAllEmployees() : [];
      console.log('Checked localDB employees:', localEmployees);
      if (!localEmployees || localEmployees.length === 0) {
        const { data: employees, error: employeeError } = await supabase
          .from('user_profiles')
          .select('id, full_name, email, role')
          .order('full_name', { ascending: true });
        if (employeeError) {
          console.error('Failed to fetch employees from Supabase:', employeeError);
        } else if (employees && employees.length > 0) {
          await Promise.all(employees.map(emp => localDB.storeEmployeeProfile(emp)));
          localStorage.setItem('cached_employees', JSON.stringify(employees));
          localStorage.setItem('cached_employee_options', JSON.stringify(employees.map(emp => ({ value: emp.id, label: emp.full_name }))));
          setEmployeeList(employees);
          setEmployeeOptions(employees.map(emp => ({ value: emp.id, label: emp.full_name })));
          // Auto-select if only one employee
          if (employees.length === 1) {
            setSelectedEmployee(employees[0].id);
            localStorage.setItem('selected_employee', employees[0].id);
          }
          console.log('Fetched employees from Supabase and saved to localDB:', employees);
          alert('✅ Employees loaded from Supabase and saved locally.');
        } else {
          console.warn('No employees found in Supabase.');
        }
      }
      // 2. Inventory (always check after employees)
      const localInventory = await localDB.getAllInventoryItems();
      console.log('Checked localDB inventory:', localInventory);
      const allZeroed = !localInventory || localInventory.length === 0 || localInventory.every(item =>
        (Number(item.start || 0) === 0) &&
        (Number(item.add || 0) === 0) &&
        (Number(item.sold || 0) === 0) &&
        (Number(item.left || 0) === 0) &&
        (Number(item.total || 0) === 0)
      );
      console.log('allZeroed:', allZeroed);
      if (allZeroed) {
        console.log('Inventory is empty or zeroed, fetching from Supabase...');
        const { data: supabaseInventory, error: supabaseError } = await supabase
          .from('pos_inventory_items')
          .select('*')
          .order('item_name', { ascending: true })
          .order('updated_at', { ascending: false });
        if (supabaseError) {
          console.error('Failed to fetch inventory from Supabase:', supabaseError);
        } else if (supabaseInventory && supabaseInventory.length > 0) {
          // Save all records to localDB for history
          await localDB.storeInventoryItems(supabaseInventory.map(item => ({
            id: item.id,
            dbId: item.id,
            name: item.item_name,
            qty: item.quantity || 1,
            price: Number(item.price || 0),
            start: Number(item.start_count || 0),
            add: Number(item.add_count || 0),
            sold: Number(item.sold_count || 0),
            left: Number(item.left_count || 0),
            total: Number(item.total_amount || 0),
            updated_at: item.updated_at
          })));
          const checkSaved = await localDB.getAllInventoryItems();
          console.log('After Save Progress: all inventory records saved to localDB:', checkSaved);
          // For display, only use the most recent record per item
          const latestByItem = {};
          for (const item of checkSaved) {
            const key = item.name;
            if (
              !latestByItem[key] ||
              new Date(item.updated_at) > new Date(latestByItem[key].updated_at)
            ) {
              latestByItem[key] = item;
            }
          }
          const mostRecentForDisplay = Object.values(latestByItem);
          await mergeMasterWithLocalInventory();
          console.log('For display, using most recent inventory per item:', mostRecentForDisplay);
          alert('✅ Inventory loaded from Supabase and saved locally.');
        } else {
          console.warn('No inventory found in Supabase.');
        }
        // Skip upload to Supabase in this case
        setLoading(false);
        return;
      } else {
        // LocalDB has data: upload to Supabase, do NOT overwrite localDB/state
        // Save all records to localDB for history
        await localDB.storeInventoryItems(inventoryItems);
        const checkSaved = await localDB.getAllInventoryItems();
        console.log('After Save Progress: all inventory records saved to localDB:', checkSaved);
        // For display, only use the most recent record per item
        const latestByItem = {};
        for (const item of checkSaved) {
          const key = item.name;
          if (
            !latestByItem[key] ||
            new Date(item.updated_at) > new Date(latestByItem[key].updated_at)
          ) {
            latestByItem[key] = item;
          }
        }
        const mostRecentForDisplay = Object.values(latestByItem);
        await mergeMasterWithLocalInventory();
        console.log('For display, using most recent inventory per item:', mostRecentForDisplay);
        // If offline, skip Supabase sync and show local save message
        if (!navigator.onLine) {
          console.log('Returning early: offline, saved locally');
          alert('✅ All data saved locally. You are offline. Press Save Progress again to sync with server when online.');
          setLoading(false);
          return;
        }
        // Upload to Supabase (one row per item per day, all in code)
        try {
          const todayISOString = new Date().toISOString();
          // Always insert a new row for each item (never update/upsert)
          const payload = inventoryItems.map(item => ({
            pos_session_id: currentSession?.id, // Link to current session
            item_name: item.name,
            quantity: item.qty || 1,
            price: Number(item.price || 0),
            start_count: Number(item.start || 0),
            add_count: Number(item.add || 0),
            sold_count: Number(item.sold || 0),
            left_count: Number(item.left || 0),
            total_amount: Number(item.total || 0),
            created_at: todayISOString,
            updated_at: todayISOString
          }));
          console.log('Preparing to upload inventory for session:', currentSession?.id);
          console.table(payload);
          let insertError = null;
          try {
            const insertResponse = await supabase.from('pos_inventory_items').insert(payload);
            console.log('Supabase insert response:', insertResponse);
            if (insertResponse.error) {
              throw insertResponse.error;
            }
            console.log('Inserted new inventory items for today:', payload);
            alert('✅ Local inventory uploaded to Supabase (insert only, full history preserved).');
          } catch (e) {
            insertError = e;
            if (e?.code === '409') {
              // Duplicate detected, generate new session ID and retry
              const newSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() :
                'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                  const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                  return v.toString(16);
                });
              console.warn('409 Conflict: Duplicate inventory for session. Creating new session:', newSessionId);
              // Update currentSession and payload
              setCurrentSession(cs => ({ ...cs, id: newSessionId }));
              const newPayload = payload.map(item => ({ ...item, pos_session_id: newSessionId }));
              try {
                await supabase.from('pos_inventory_items').insert(newPayload);
                console.log('Inserted inventory items with new session:', newPayload);
                alert('✅ Duplicate detected. Started new session and uploaded inventory.');
              } catch (retryErr) {
                console.error('Retry insert failed:', retryErr);
                alert('❌ Failed to upload inventory after starting new session.');
              }
            } else {
              console.error('Error uploading inventory to Supabase:', e);
            }
          }
        } catch (e) {
          console.error('Error uploading inventory to Supabase:', e);
        }
      }
      // In handleSave, when saving session to localDB and Supabase
      // Save notes and all totals/cash fields to localDB as part of session
      if (localDB.storeSession && currentSession) {
        const sessionToSave = {
          ...currentSession,
          notes,
          inventory_total: totals.inventorySalesTotal,
          wash_dry_total: totals.washDrySubtotal,
          grand_total: totals.grandTotal,
          cash_started: cashData.started,
          cash_added: cashData.added,
          cash_total: cashData.total
        };
        console.log('Saving session to localDB:', sessionToSave);
        await localDB.storeSession(sessionToSave);
        console.log('Saved session with notes and totals/cash to localDB:', sessionToSave);
      }
      // --- Save session to Supabase ---
      let sessionId = currentSession?.id;
      let sessionPayload = {
        ...currentSession,
        employee_id: selectedEmployee,
        cash_started: cashData.started,
        cash_added: cashData.added,
        cash_total: cashData.total,
        inventory_total: totals.inventorySalesTotal,
        wash_dry_total: totals.washDrySubtotal,
        grand_total: totals.grandTotal,
        notes,
        updated_at: new Date().toISOString(),
      };
      let retry = false;
      let retryCount = 0;
      do {
        retry = false;
        console.log('--- Attempting to save session to Supabase ---');
        const { error: sessionError } = await supabase
              .from('pos_sessions')
          .upsert([sessionPayload], { onConflict: 'id' });
        if (sessionError && sessionError.code === '409' && retryCount < 2) {
          // 409 conflict: generate new session ID and retry
          const newSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() :
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
              const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
          sessionId = newSessionId;
          sessionPayload = { ...sessionPayload, id: newSessionId };
          setCurrentSession(cs => ({ ...cs, id: newSessionId }));
          retry = true;
          retryCount++;
          console.warn('409 Conflict: Duplicate session. Retrying with new session ID:', newSessionId);
        } else if (sessionError) {
          console.error('Error saving session to Supabase:', sessionError);
          alert('❌ Failed to save session. Inventory and tickets not saved.');
          setLoading(false);
          return;
        }
      } while (retry && retryCount < 2);
      // --- Confirm session exists in database ---
      const { data: sessionRows, error: selectSessionError } = await supabase
        .from('pos_sessions')
        .select('id')
        .eq('id', sessionId);
      if (selectSessionError || !sessionRows || sessionRows.length === 0) {
        alert('❌ Session row not found in database. Please check your internet connection and retry.');
        setLoading(false);
        return;
      }
      // --- Save inventory items ---
      const todayISOString = new Date().toISOString();
      const inventoryPayload = inventoryItems.map(item => ({
        pos_session_id: sessionId,
        item_name: item.name,
        quantity: item.qty || 1,
        price: Number(item.price || 0),
        start_count: Number(item.start || 0),
        add_count: Number(item.add || 0),
        sold_count: Number(item.sold || 0),
        left_count: Number(item.left || 0),
        total_amount: Number(item.total || 0),
        created_at: todayISOString,
        updated_at: todayISOString
      }));
      const insertInventoryResponse = await supabase.from('pos_inventory_items').insert(inventoryPayload);
      if (insertInventoryResponse.error) {
        alert('❌ Failed to save inventory.');
        setLoading(false);
        return;
      }
      // --- Save tickets ---
      const ticketPayload = tickets.map(ticket => ({
        pos_session_id: sessionId,
        ticket_number: ticket.ticketNumber,
        wash_amount: ticket.wash || 0,
        dry_amount: ticket.dry || 0,
        total_amount: ticket.total || 0,
        created_at: todayISOString,
        updated_at: todayISOString
      }));
      const insertTicketResponse = await supabase.from('pos_wash_dry_tickets').insert(ticketPayload);
      if (insertTicketResponse.error) {
        alert('❌ Failed to save tickets.');
        setLoading(false);
        return;
      }
      alert('✅ All data saved to Supabase successfully!');
      // --- Timesheet sync logic ---
      if (timesheetService.syncTimesheets) {
        const syncResults = await timesheetService.syncTimesheets();
        const successCount = Array.isArray(syncResults) ? syncResults.filter(r => r.success).length : 0;
        const failureCount = Array.isArray(syncResults) ? syncResults.filter(r => !r.success).length : 0;
        if (successCount > 0 || failureCount > 0) {
          alert(`Timesheet sync complete: ${successCount} succeeded, ${failureCount} failed.`);
        }
      }
    } catch (err) {
      console.error('❌ Error in handleSave:', err);
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

  useEffect(() => {
    const loadFromLocalDB = async () => {
      await localDB.ready;
      // Load inventory
      const localInventory = await localDB.getAllInventoryItems();
      console.log('Loaded inventory from localDB:', localInventory);
      if (localInventory && localInventory.length > 0) {
        setInventoryItems(localInventory);
      } else {
        // Only set defaults if localDB is empty
        setInventoryItems([
          { id: 1, name: 'Downy 19 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
          { id: 2, name: 'Gain Sheets 15ct', qty: 1, price: 2.25, start: 0, add: 0, sold: 0, left: 0, total: 0 },
          { id: 3, name: 'Roma 17 63 oz', qty: 1, price: 2.75, start: 0, add: 0, sold: 0, left: 0, total: 0 },
          { id: 4, name: 'Xtra 56 oz', qty: 1, price: 5.50, start: 0, add: 0, sold: 0, left: 0, total: 0 },
          { id: 5, name: 'Clorox 16 oz', qty: 1, price: 2.50, start: 0, add: 0, sold: 0, left: 0, total: 0 }
        ]);
      }
      // Load tickets
      if (localDB.getAllTickets) {
        const localTickets = await localDB.getAllTickets();
        console.log('Loaded tickets from localDB:', localTickets);
        if (localTickets && localTickets.length > 0) {
          setTickets(localTickets);
        } else {
          setTickets([
            { id: 1, ticketNumber: '001', wash: 0, dry: 0, total: 0 },
            { id: 2, ticketNumber: '002', wash: 0, dry: 0, total: 0 },
            { id: 3, ticketNumber: '003', wash: 0, dry: 0, total: 0 }
          ]);
        }
      }
      // Load session
      if (localDB.getSession) {
        const localSession = await localDB.getSession();
        console.log('Loaded session from localDB:', localSession);
        if (localSession) setCurrentSession(localSession);
      }
    };
    loadFromLocalDB();
  }, []);

  // Add or update this useEffect to always create a session when selectedEmployee is set
  useEffect(() => {
    if (selectedEmployee && !currentSession) {
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
      setCurrentSession({
        id: generateUUID(),
        created_at: new Date().toISOString(),
        employee_id: selectedEmployee,
        status: 'active'
      });
      console.log('Auto-created new session for employee:', selectedEmployee);
    }
  }, [selectedEmployee, currentSession]);

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

  // Persist tickets to localDB after every change
  useEffect(() => {
    if (localDB.storeTickets) {
      localDB.storeTickets(tickets).catch(e => console.error('Failed to save tickets to localDB:', e));
    }
  }, [tickets]);

  // Persist cashData to localDB (as part of session) after every change
  useEffect(() => {
    if (localDB.getSession && localDB.storeSession && currentSession) {
      localDB.getSession().then(session => {
        const updatedSession = {
          ...(session || {}),
          id: currentSession.id,
          created_at: currentSession.created_at,
          employee_id: currentSession.employee_id,
          status: currentSession.status,
          cash_started: cashData.started,
          cash_added: cashData.added,
          cash_total: cashData.total,
        };
        localDB.storeSession(updatedSession).catch(e => console.error('Failed to save cashData to localDB:', e));
      });
    }
  }, [cashData, currentSession]);

  // On mount, restore cashData from localDB session if available
  useEffect(() => {
    if (localDB.getSession) {
      localDB.getSession().then(localSession => {
        if (localSession && (localSession.cash_started !== undefined || localSession.cash_added !== undefined)) {
          setCashData({
            started: localSession.cash_started || 0,
            added: localSession.cash_added || 0,
            total: localSession.cash_total || 0,
          });
        }
      });
    }
  }, []);

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