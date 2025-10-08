import { localDB } from './localDB.jsx';

export const InventoryService = {
  async fetchAll() {
    return await localDB.getAllInventoryItems();
  },
  async save(items) {
    return await localDB.storeInventoryItems(items);
  }
};
