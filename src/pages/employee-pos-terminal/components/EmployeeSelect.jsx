import React from 'react';

const EmployeeSelect = ({ employees, selectedEmployeeId, onChange }) => {
  if (!employees || employees.length === 0) {
    return (
      <div className="text-amber-600 bg-amber-50 p-3 rounded-lg flex items-center">
        <div className="flex-1">No employees loaded. Click "Save Progress" to download employee data.</div>
      </div>
    );
  }
  return (
    <select
      className="border rounded px-2 py-1"
      value={selectedEmployeeId || ''}
      onChange={e => {
        onChange(e.target.value);
      }}
    >
      <option value="" disabled>Select employee</option>
      {employees
        .filter(emp => emp.role === 'employee')
        .filter(emp => {
          const name = (emp.full_name || emp.name || emp.email || '').toLowerCase();
          return !name.includes('admin') && !name.includes('manager');
        })
        .map(emp => (
          <option key={emp.id} value={emp.id}>
            {emp.full_name || emp.name || emp.email}
          </option>
        ))}
    </select>
  );
};

export default EmployeeSelect;
