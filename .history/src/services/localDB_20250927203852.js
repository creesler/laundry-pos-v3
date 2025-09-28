class LocalDB {
  constructor() {
    this.dbName = 'LaundryKingPOS';
    this.dbVersion = 2;
    this.db = null;
    this.ready = this.initializeDB();
  }

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
          console.log('📦 Upgrading database structure...');
          if (!db.objectStoreNames.contains('employeeProfiles')) {
            const employeeStore = db.createObjectStore('employeeProfiles', { keyPath: 'id' });
            employeeStore.createIndex('full_name', 'full_name', { unique: false });
            employeeStore.createIndex('email', 'email', { unique: true });
          }
          if (!db.objectStoreNames.contains('inventoryItems')) {
            const inventoryStore = db.createObjectStore('inventoryItems', { keyPath: 'id' });
            inventoryStore.createIndex('item_name', 'item_name', { unique: false });
          }
          if (!db.objectStoreNames.contains('posSessions')) {
            db.createObjectStore('posSessions', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('timesheets')) {
            db.createObjectStore('timesheets', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('tickets')) {
            db.createObjectStore('tickets', { keyPath: 'id' });
          }
        };
      });
    }

    storeEmployeeProfile(profile) {
      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }
        try {
          const transaction = this.db.transaction('employeeProfiles', 'readwrite');
          const store = transaction.objectStore('employeeProfiles');
          store.put(profile);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        } catch (error) {
          reject(error);
        }
      });
    }

    storeInventoryItems(items) {
      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }
        try {
          const transaction = this.db.transaction('inventoryItems', 'readwrite');
          const store = transaction.objectStore('inventoryItems');
          items.forEach(item => store.put(item));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        } catch (error) {
          reject(error);
        }
      });
    }

    storeSession(session) {
      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }
        try {
          const transaction = this.db.transaction('posSessions', 'readwrite');
          const store = transaction.objectStore('posSessions');
          store.put(session);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        } catch (error) {
          reject(error);
        }
      });
    }

    storeTimesheet(timesheet) {
      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }
        try {
          const transaction = this.db.transaction('timesheets', 'readwrite');
          const store = transaction.objectStore('timesheets');
          store.put(timesheet);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        } catch (error) {
          reject(error);
        }
      });
    }

    storeTicket(ticket) {
      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }
        try {
          const transaction = this.db.transaction('tickets', 'readwrite');
          const store = transaction.objectStore('tickets');
          store.put(ticket);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        } catch (error) {
          reject(error);
        }
      });
    }
  }

  storeEmployeeProfile(profile) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      try {
        const transaction = this.db.transaction('employeeProfiles', 'readwrite');
        const store = transaction.objectStore('employeeProfiles');
        const emailIndex = store.index('email');
        const emailQuery = emailIndex.get(profile.email);

        emailQuery.onsuccess = () => {
          if (emailQuery.result) {
            // Employee with this email already exists, skip insert
            console.log(`⚠️ Employee with email ${profile.email} already exists, skipping insert.`);
            resolve();
          } else {
            // Insert new employee
            const request = store.put({
              id: profile.id,
              full_name: profile.full_name,
              email: profile.email,
              role: profile.role
            });
            request.onsuccess = () => {
              console.log(`✅ Stored employee profile: ${profile.full_name}`);
              resolve();
            };
            request.onerror = () => {
              console.error('Failed to store employee:', request.error);
              reject(request.error);
            };
          }
        };
        emailQuery.onerror = () => {
          console.error('Error checking employee email:', emailQuery.error);
          reject(emailQuery.error);
        };
      } catch (error) {
        console.error('Error storing employee:', error);
        reject(error);
      }
    });
  }

  getNextTicketNumber() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        const timestamp = Date.now().toString().slice(-3);
        resolve(timestamp.padStart(3, '0'));
        return;
      }

      try {
        const transaction = this.db.transaction(['ticketSequence'], 'readwrite');
        const store = transaction.objectStore('ticketSequence');
        const request = store.get('current');
        
        request.onsuccess = () => {
          const data = request.result || { id: 'current', lastNumber: 0 };
          const nextNumber = (data.lastNumber + 1).toString().padStart(3, '0');
          store.put({ ...data, lastNumber: data.lastNumber + 1 });
          resolve(nextNumber);
        };
        
        request.onerror = () => {
          console.error('Error getting next ticket number:', request.error);
          const timestamp = Date.now().toString().slice(-3);
          resolve(timestamp.padStart(3, '0'));
        };
      } catch (error) {
        console.error('Error getting next ticket number:', error);
        const timestamp = Date.now().toString().slice(-3);
        resolve(timestamp.padStart(3, '0'));
      }
    });
  }
}

export const localDB = new LocalDB();