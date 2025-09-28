// Service for handling employee-related operations in an offline-first manner
import { localDB } from './localDB';

class EmployeeService {
  constructor() {
    this.CACHE_KEY = 'cached_employees';
    this.OPTIONS_CACHE_KEY = 'cached_employee_options';
  }

    loadEmployees(setEmployeeList, setEmployeeOptions, setError, setLoadingEmployees) {
    setLoadingEmployees(true);
    setError(null);
    
    // Chain promises to handle async operations
    return localDB.getAllEmployees()
      .then(localEmployees => {
        // 1. Check IndexedDB results
        if (localEmployees?.length > 0) {
          const employeeNames = localEmployees.map(emp => emp.full_name);
          const options = localEmployees.map(emp => ({
            value: emp.id,
            label: emp.full_name
          }));
          setEmployeeList(employeeNames);
          setEmployeeOptions(options);
          console.log('✅ Loaded employees from local DB');
          return Promise.resolve(); // Exit chain
        }
        
        // 2. Try localStorage if IndexedDB empty
        const cachedEmployees = localStorage.getItem(this.CACHE_KEY);
        const cachedOptions = localStorage.getItem(this.OPTIONS_CACHE_KEY);
        
        if (cachedEmployees && cachedOptions) {
          try {
            const parsed = JSON.parse(cachedEmployees);
            const parsedOptions = JSON.parse(cachedOptions);
            
            if (Array.isArray(parsed) && parsed.length > 0) {
              setEmployeeList(parsed);
              setEmployeeOptions(parsedOptions);
              console.log(`🔄 Loaded ${parsed.length} employees from cache`);
              
              // Store in IndexedDB for future use
              return Promise.all(parsedOptions.map(opt => 
                localDB.storeEmployeeProfile({
                  id: opt.value,
                  full_name: opt.label,
                  email: `${opt.label.toLowerCase().replace(/\s+/g, '.')}@example.com`,
                  role: 'employee'
                })
              ));
            }
          } catch (e) {
            console.warn('Failed to parse cached employees:', e);
          }
        }
        
        // 3. Create default test employee if no data found
        console.log('ℹ️ No employees found, creating default test employee');
        const defaultEmployee = {
          id: crypto.randomUUID(),
          full_name: 'Test Employee',
          email: 'test@example.com',
          role: 'employee'
        };
        
        // Update state
        setEmployeeList([defaultEmployee.full_name]);
        setEmployeeOptions([{
          value: defaultEmployee.id,
          label: defaultEmployee.full_name
        }]);
        
        // Store in both IndexedDB and localStorage
        localStorage.setItem(this.CACHE_KEY, JSON.stringify([defaultEmployee.full_name]));
        localStorage.setItem(this.OPTIONS_CACHE_KEY, JSON.stringify([{
          value: defaultEmployee.id,
          label: defaultEmployee.full_name
        }]));
        
        return localDB.storeEmployeeProfile(defaultEmployee)
          .then(() => {
            console.log('✨ Created default test employee for offline use');
          });
      })
      .catch(err => {
        console.error('Failed to load employees:', err);
        setError('Failed to load employees. Please try again later.');
        
        // Don't clear the employee list if we have cached data
        const cachedEmployees = localStorage.getItem(this.CACHE_KEY);
        if (!cachedEmployees) {
          setEmployeeList([]);
        }
      })
      .finally(() => {
        setLoadingEmployees(false);
      });
      
    } catch (err) {
      console.error('Failed to load employees:', err);
      setError('Failed to load employees. Please try again later.');
      
      // Don't clear the employee list if we have cached data
      const cachedEmployees = localStorage.getItem(this.CACHE_KEY);
      if (!cachedEmployees) {
        setEmployeeList([]);
      }
    } finally {
      setLoadingEmployees(false);
    }
  }
}

export const employeeService = new EmployeeService();