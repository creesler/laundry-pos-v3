class LocalDB {
  constructor() {
    this.dbName = 'LaundryKingPOS';
    this.dbVersion = 2;
    this.db = null;
    this.ready = this.initializeDB();
  }

  initializeDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject('Failed to open database');
      };
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Employee store
        if (!db.objectStoreNames.contains('employeeProfiles')) {
          const employeeStore = db.createObjectStore('employeeProfiles', { keyPath: 'id' });
          employeeStore.createIndex('full_name', 'full_name', { unique: false });
          employeeStore.createIndex('email', 'email', { unique: true });
        }
        // Inventory store
        if (!db.objectStoreNames.contains('posInventoryItems')) {
          const inventoryStore = db.createObjectStore('posInventoryItems', { keyPath: 'id', autoIncrement: true });
          inventoryStore.createIndex('item_name', 'item_name', { unique: false });
        }
        // Ticket sequence
        if (!db.objectStoreNames.contains('ticketSequence')) {
          const ticketStore = db.createObjectStore('ticketSequence', { keyPath: 'id' });
          ticketStore.add({ id: 'current', lastNumber: 0 });
        }
        // Pending changes
        if (!db.objectStoreNames.contains('pendingChanges')) {
          db.createObjectStore('pendingChanges', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  getAllEmployees() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      try {
        const tx = this.db.transaction('employeeProfiles', 'readonly');
        const store = tx.objectStore('employeeProfiles');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  storeEmployeeProfile(profile) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      try {
        const tx = this.db.transaction('employeeProfiles', 'readwrite');
        const store = tx.objectStore('employeeProfiles');
        const req = store.put(profile);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  getAllInventoryItems() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      try {
        const tx = this.db.transaction('posInventoryItems', 'readonly');
        const store = tx.objectStore('posInventoryItems');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  storeInventoryItems(items) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      try {
        const tx = this.db.transaction('posInventoryItems', 'readwrite');
        const store = tx.objectStore('posInventoryItems');
        let completed = 0;
        items.forEach(item => {
          const req = store.put(item);
          req.onsuccess = () => {
            completed++;
            if (completed === items.length) resolve();
          };
          req.onerror = () => reject(req.error);
        });
        if (items.length === 0) resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  getNextTicketNumber() {
    return new Promise((resolve) => {
      if (!this.db) {
        const timestamp = Date.now().toString().slice(-3);
        return resolve(timestamp.padStart(3, '0'));
      }
      try {
        const tx = this.db.transaction('ticketSequence', 'readwrite');
        const store = tx.objectStore('ticketSequence');
        const req = store.get('current');
        req.onsuccess = () => {
          const data = req.result || { id: 'current', lastNumber: 0 };
          const nextNumber = (data.lastNumber + 1).toString().padStart(3, '0');
          store.put({ ...data, lastNumber: data.lastNumber + 1 });
          resolve(nextNumber);
        };
        req.onerror = () => {
          const timestamp = Date.now().toString().slice(-3);
          resolve(timestamp.padStart(3, '0'));
        };
      } catch (e) {
        const timestamp = Date.now().toString().slice(-3);
        resolve(timestamp.padStart(3, '0'));
      }
    });
  }

    // Batch generate sequential ticket numbers
    generateTicketNumbers(count = 3) {
      return new Promise((resolve) => {
        if (!this.db) {
          // Fallback: use timestamp-based numbers
          const baseNumber = parseInt(Date.now().toString().slice(-3));
          const ticketNumbers = [];
          for (let i = 0; i < count; i++) {
            ticketNumbers.push(((baseNumber + i) % 1000).toString().padStart(3, '0'));
          }
          return resolve(ticketNumbers);
        }
        try {
          const tx = this.db.transaction('ticketSequence', 'readwrite');
          const store = tx.objectStore('ticketSequence');
          const req = store.get('current');
          req.onsuccess = () => {
            const data = req.result || { id: 'current', lastNumber: 0 };
            const ticketNumbers = [];
            let lastNumber = data.lastNumber;
            for (let i = 0; i < count; i++) {
              lastNumber++;
              ticketNumbers.push(lastNumber.toString().padStart(3, '0'));
            }
            store.put({ ...data, lastNumber });
            resolve(ticketNumbers);
          };
          req.onerror = () => {
            const baseNumber = parseInt(Date.now().toString().slice(-3));
            const ticketNumbers = [];
            for (let i = 0; i < count; i++) {
              ticketNumbers.push(((baseNumber + i) % 1000).toString().padStart(3, '0'));
            }
            resolve(ticketNumbers);
          };
        } catch (e) {
          const baseNumber = parseInt(Date.now().toString().slice(-3));
          const ticketNumbers = [];
          for (let i = 0; i < count; i++) {
            ticketNumbers.push(((baseNumber + i) % 1000).toString().padStart(3, '0'));
          }
          resolve(ticketNumbers);
        }
      });
    }
}
export const localDB = new LocalDB();