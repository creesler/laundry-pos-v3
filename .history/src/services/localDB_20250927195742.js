class LocalDB {
  constructor() {
    this.dbName = 'LaundryKingPOS';
    this.dbVersion = 1;
    this.db = null;
    this.initializeDB();
  }

  // Store for maintaining relationships locally
  async storeEmployeeProfile(profile) {
    const store = this.db.transaction('employeeProfiles', 'readwrite').objectStore('employeeProfiles');
    await store.put({
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role
    });
  }

  async getEmployeeByName(fullName) {
    const store = this.db.transaction('employeeProfiles', 'readonly').objectStore('employeeProfiles');
    const index = store.index('full_name');
    return await index.get(fullName);
  }

  async getAllEmployees() {
    const store = this.db.transaction('employeeProfiles', 'readonly').objectStore('employeeProfiles');
    return await store.getAll();
  }

  async initializeDB() {
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
        
        // Create object store for ticket sequence
        if (!db.objectStoreNames.contains('ticketSequence')) {
          const ticketStore = db.createObjectStore('ticketSequence', { keyPath: 'id' });
          // Initialize with default value if it doesn't exist
          ticketStore.transaction.oncomplete = () => {
            const ticketSequence = db.transaction('ticketSequence', 'readwrite')
              .objectStore('ticketSequence');
            ticketSequence.get('current').onsuccess = (e) => {
              if (!e.target.result) {
                ticketSequence.add({ id: 'current', lastNumber: 0 });
              }
            };
          };
        }
        
        // Create object store for pending changes
        if (!db.objectStoreNames.contains('pendingChanges')) {
          db.createObjectStore('pendingChanges', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  // Get the next ticket number
  async getNextTicketNumber() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction(['ticketSequence'], 'readwrite');
      const store = transaction.objectStore('ticketSequence');
      
      const request = store.get('current');
      
      request.onsuccess = (event) => {
        const data = event.target.result || { id: 'current', lastNumber: 0 };
        const nextNumber = (data.lastNumber + 1).toString().padStart(3, '0');
        
        // Update the last number
        store.put({ ...data, lastNumber: data.lastNumber + 1 });
        
        resolve(nextNumber);
      };
      
      request.onerror = (event) => {
        console.error('Error getting next ticket number:', event.target.error);
        // Fallback to timestamp if there's an error
        const timestamp = Date.now().toString().slice(-3);
        resolve(timestamp.padStart(3, '0'));
      };
    });
  }

  // Generate multiple sequential ticket numbers
  async generateTicketNumbers(count = 3) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject('Database not initialized');
        return;
      }

      const transaction = this.db.transaction(['ticketSequence'], 'readwrite');
      const store = transaction.objectStore('ticketSequence');
      
      const request = store.get('current');
      
      request.onsuccess = (event) => {
        const data = event.target.result || { id: 'current', lastNumber: 0 };
        const ticketNumbers = [];
        
        // Generate the requested number of sequential tickets
        for (let i = 1; i <= count; i++) {
          const nextNumber = data.lastNumber + i;
          ticketNumbers.push(nextNumber.toString().padStart(3, '0'));
        }
        
        // Update the last number to the highest generated number
        store.put({ ...data, lastNumber: data.lastNumber + count });
        
        resolve(ticketNumbers);
      };
      
      request.onerror = (event) => {
        console.error('Error generating ticket numbers:', event.target.error);
        // Fallback to timestamp-based numbers if there's an error
        const baseNumber = parseInt(Date.now().toString().slice(-3));
        const ticketNumbers = [];
        for (let i = 0; i < count; i++) {
          ticketNumbers.push(((baseNumber + i) % 1000).toString().padStart(3, '0'));
        }
        resolve(ticketNumbers);
      };
    });
  }

  // Add pending changes to sync when online
  async addPendingChange(change) {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      const request = store.add({
        type: change.type,
        data: change.data,
        timestamp: new Date().toISOString(),
        synced: false
      });
      
      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error('Error adding pending change:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Get all pending changes
  async getPendingChanges() {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingChanges'], 'readonly');
      const store = transaction.objectStore('pendingChanges');
      const request = store.getAll();
      
      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };
      
      request.onerror = (event) => {
        console.error('Error getting pending changes:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Mark changes as synced
  async markChangesAsSynced(ids) {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      // Get all changes
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = (event) => {
        const changes = event.target.result || [];
        let completed = 0;
        let errors = 0;
        
        if (changes.length === 0) {
          resolve({ completed: 0, errors: 0 });
          return;
        }
        
        changes.forEach((change) => {
          if (ids.includes(change.id)) {
            const updateRequest = store.put({ ...change, synced: true });
            
            updateRequest.onsuccess = () => {
              completed++;
              if (completed + errors >= changes.length) {
                resolve({ completed, errors });
              }
            };
            
            updateRequest.onerror = () => {
              errors++;
              if (completed + errors >= changes.length) {
                resolve({ completed, errors });
              }
            };
          } else {
            completed++;
            if (completed + errors >= changes.length) {
              resolve({ completed, errors });
            }
          }
        });
      };
      
      getAllRequest.onerror = (event) => {
        console.error('Error getting changes to mark as synced:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Clear synced changes
  async clearSyncedChanges() {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
      const store = transaction.objectStore('pendingChanges');
      
      // Get all synced changes
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(true));
      
      request.onsuccess = (event) => {
        const changes = event.target.result || [];
        let completed = 0;
        let errors = 0;
        
        if (changes.length === 0) {
          resolve({ deleted: 0, errors: 0 });
          return;
        }
        
        changes.forEach((change) => {
          const deleteRequest = store.delete(change.id);
          
          deleteRequest.onsuccess = () => {
            completed++;
            if (completed + errors >= changes.length) {
              resolve({ deleted: completed, errors });
            }
          };
          
          deleteRequest.onerror = () => {
            errors++;
            if (completed + errors >= changes.length) {
              resolve({ deleted: completed, errors });
            }
          };
        });
      };
      
      request.onerror = (event) => {
        console.error('Error getting synced changes to clear:', event.target.error);
        reject(event.target.error);
      };
    });
  }
}

export const localDB = new LocalDB();
