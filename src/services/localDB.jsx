// IndexedDB wrapper for local storage
const DB_NAME = 'laundryking_pos';
const DB_VERSION = 2; // Increment version to add new store

// Helper to wrap request in promise
const requestToPromise = (request) => new Promise((resolve, reject) => {
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
});

class LocalDB {
  constructor() {
    this.ready = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Employee Profiles Store
        if (!db.objectStoreNames.contains('employeeProfiles')) {
          db.createObjectStore('employeeProfiles', { keyPath: 'id' });
        }

        // POS Inventory Items Store
        if (!db.objectStoreNames.contains('posInventoryItems')) {
          const inventoryStore = db.createObjectStore('posInventoryItems', { keyPath: 'id' });
          inventoryStore.createIndex('synced', 'synced', { unique: false });
        }

        // Latest Inventory State Store
        if (!db.objectStoreNames.contains('latestInventory')) {
          db.createObjectStore('latestInventory', { keyPath: 'name' });
        }

        // POS Tickets Store
        if (!db.objectStoreNames.contains('posTickets')) {
          const ticketsStore = db.createObjectStore('posTickets', { keyPath: 'id' });
          ticketsStore.createIndex('synced', 'synced', { unique: false });
        }

        // POS Session Store
        if (!db.objectStoreNames.contains('posSession')) {
          const sessionStore = db.createObjectStore('posSession', { keyPath: 'id' });
          sessionStore.createIndex('synced', 'synced', { unique: false });
        }

        // Ticket Sequence Store
        if (!db.objectStoreNames.contains('ticketSequence')) {
          db.createObjectStore('ticketSequence', { keyPath: 'id' });
        }

        // Employee Timesheets Store
        if (!db.objectStoreNames.contains('employeeTimesheets')) {
          const timesheetStore = db.createObjectStore('employeeTimesheets', { keyPath: 'id' });
          timesheetStore.createIndex('synced', 'synced', { unique: false });
          timesheetStore.createIndex('employee_id', 'employee_id', { unique: false });
          timesheetStore.createIndex('session_id', 'session_id', { unique: false });
        }
      };
    });
  }

  async storeEmployeeProfile(employee) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['employeeProfiles'], 'readwrite');
      const store = transaction.objectStore('employeeProfiles');
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      
      try {
        store.put(employee);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAllEmployees() {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['employeeProfiles'], 'readonly');
      const store = transaction.objectStore('employeeProfiles');
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async storeInventoryItems(items) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['posInventoryItems', 'latestInventory'], 'readwrite');
      const store = transaction.objectStore('posInventoryItems');
      const latestStore = transaction.objectStore('latestInventory');
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      try {
        // Add synced: 0 to each item
        const itemsToStore = items.map(item => ({
          ...item,
          synced: 0,
          id: item.id || `${item.pos_session_id}_${item.name}_${Date.now()}`
        }));

        // Store each item
        for (const item of itemsToStore) {
          // Store in posInventoryItems
          store.put(item);

          // Update latestInventory
          const latestItem = {
            name: item.name,
            price: item.price,
            start: item.start,
            left: item.left,
            updated_at: new Date().toISOString()
          };
          
          // Get existing item to preserve highest values
          const existingRequest = latestStore.get(item.name);
          existingRequest.onsuccess = () => {
            const existingItem = existingRequest.result;
            if (existingItem) {
              latestItem.start = Math.max(existingItem.start, item.start);
              latestItem.left = Math.max(existingItem.left, item.left);
            }
            latestStore.put(latestItem);
          };
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAllInventoryItems() {
    await this.ready;
    const transaction = this.db.transaction(['posInventoryItems', 'latestInventory'], 'readonly');
    const store = transaction.objectStore('posInventoryItems');
    const latestStore = transaction.objectStore('latestInventory');
    
    try {
      const [items, latestItems] = await Promise.all([
        requestToPromise(store.getAll()),
        requestToPromise(latestStore.getAll())
      ]);
      
      // Create a map of latest state by item name
      const latestState = {};
      latestItems.forEach(item => {
        latestState[item.name] = item;
      });
      
      // Merge historical records with latest state
      return items.map(item => ({
        ...item,
        start: latestState[item.name]?.start || item.start,
        left: latestState[item.name]?.left || item.left
      }));
    } catch (error) {
      console.error('Error getting inventory items:', error);
      return [];
    }
  }

  async getUnsyncedInventoryItems() {
    await this.ready;
    const transaction = this.db.transaction(['posInventoryItems'], 'readonly');
    const store = transaction.objectStore('posInventoryItems');
    const index = store.index('synced');
    const request = index.getAll(0); // Get items where synced = 0
    
    // Get all unsynced items
    const items = await requestToPromise(request);
    return items.filter(item => item.pos_session_id); // Filter for valid session IDs
  }

  async markInventoryItemsSynced(ids) {
    await this.ready;
    const transaction = this.db.transaction(['posInventoryItems'], 'readwrite');
    const store = transaction.objectStore('posInventoryItems');
    
    let completed = 0;
    let errors = [];
    
    return new Promise((resolve, reject) => {
      ids.forEach(id => {
        const request = store.get(id);
        request.onerror = () => {
          errors.push(request.error);
          completed++;
          if (completed === ids.length) {
            if (errors.length > 0) reject(errors);
            else resolve();
          }
        };
        request.onsuccess = () => {
          const item = request.result;
          if (item) {
            item.synced = 1; // Mark as synced using number
            store.put(item);
          }
          completed++;
          if (completed === ids.length) {
            if (errors.length > 0) reject(errors);
            else resolve();
          }
        };
      });
    });
  }

  async storeTickets(tickets) {
    await this.ready;
    const transaction = this.db.transaction(['posTickets'], 'readwrite');
    const store = transaction.objectStore('posTickets');
    
    // Add synced: 0 to each ticket and ensure unique IDs per session
    const ticketsToStore = tickets.map(ticket => {
      if (!ticket.pos_session_id) {
        console.error('❌ Ticket missing session ID:', ticket);
        throw new Error('Cannot store ticket without session ID');
      }
      return {
        ...ticket,
        id: ticket.id || `${ticket.pos_session_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        synced: 0,
        created_at: ticket.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });
    
    return Promise.all(ticketsToStore.map(ticket => requestToPromise(store.put(ticket))));
  }

  async getAllTickets() {
    await this.ready;
    const transaction = this.db.transaction(['posTickets'], 'readonly');
    const store = transaction.objectStore('posTickets');
    return requestToPromise(store.getAll());
  }

  async getUnsyncedTickets() {
    await this.ready;
    const transaction = this.db.transaction(['posTickets'], 'readonly');
    const store = transaction.objectStore('posTickets');
    const index = store.index('synced');
    return requestToPromise(index.getAll(0)); // Get tickets where synced = 0
  }

  async markTicketsSynced(ids) {
    await this.ready;
    const transaction = this.db.transaction(['posTickets'], 'readwrite');
    const store = transaction.objectStore('posTickets');
    
    return Promise.all(ids.map(async id => {
      const ticket = await requestToPromise(store.get(id));
      if (ticket) {
        ticket.synced = 1; // Mark as synced using number
        return requestToPromise(store.put(ticket));
      }
    }));
  }

  async storeSession(session) {
    await this.ready;
    const transaction = this.db.transaction(['posSession'], 'readwrite');
    const store = transaction.objectStore('posSession');
    
    // Add synced: 0
    const sessionToStore = {
      ...session,
      synced: 0
    };
    
    return requestToPromise(store.put(sessionToStore));
  }

  async getSession() {
    await this.ready;
    const transaction = this.db.transaction(['posSession'], 'readonly');
    const store = transaction.objectStore('posSession');
    const sessions = await requestToPromise(store.getAll());
    return sessions[sessions.length - 1]; // Return most recent session
  }

  async getSessionByEmployeeAndDate(employeeId, date) {
    await this.ready;
    const transaction = this.db.transaction(['posSession'], 'readonly');
    const store = transaction.objectStore('posSession');
    const sessions = await requestToPromise(store.getAll());
    
    // Get all matching sessions and sort by creation time (newest first)
    const matchingSessions = sessions
      .filter(s => 
        s.employee_id === employeeId && 
        s.session_date === date && 
        s.status === 'active'
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Return the most recent session
    return matchingSessions[0];
  }

  async getUnsyncedSessions() {
    await this.ready;
    const transaction = this.db.transaction(['posSession'], 'readonly');
    const store = transaction.objectStore('posSession');
    const index = store.index('synced');
    return requestToPromise(index.getAll(0)); // Get sessions where synced = 0
  }

  async markSessionsSynced(ids) {
    await this.ready;
    const transaction = this.db.transaction(['posSession'], 'readwrite');
    const store = transaction.objectStore('posSession');
    
    return Promise.all(ids.map(async id => {
      const session = await requestToPromise(store.get(id));
      if (session) {
        session.synced = 1; // Mark as synced using number
        return requestToPromise(store.put(session));
      }
    }));
  }

  async storeTimesheet(timesheet) {
    await this.ready;
    const transaction = this.db.transaction(['employeeTimesheets'], 'readwrite');
    const store = transaction.objectStore('employeeTimesheets');
    
    // Add synced: 0
    const timesheetToStore = {
      ...timesheet,
      synced: 0
    };
    
    return requestToPromise(store.put(timesheetToStore));
  }

  async getUnsyncedTimesheets() {
    await this.ready;
    const transaction = this.db.transaction(['employeeTimesheets'], 'readonly');
    const store = transaction.objectStore('employeeTimesheets');
    const index = store.index('synced');
    return requestToPromise(index.getAll(0)); // Get timesheets where synced = 0
  }

  async markTimesheetsSynced(ids) {
    await this.ready;
    const transaction = this.db.transaction(['employeeTimesheets'], 'readwrite');
    const store = transaction.objectStore('employeeTimesheets');
    
    return Promise.all(ids.map(async id => {
      const timesheet = await requestToPromise(store.get(id));
      if (timesheet) {
        timesheet.synced = 1; // Mark as synced using number
        return requestToPromise(store.put(timesheet));
      }
    }));
  }
}

export const localDB = new LocalDB();
