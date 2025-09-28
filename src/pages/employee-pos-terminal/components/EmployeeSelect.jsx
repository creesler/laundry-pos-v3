import React from 'react';

const EmployeeSelect = ({ employees, selectedEmployeeId, onChange }) => {
  if (!employees || employees.length === 0) {
    return <div className="text-red-500">No employees loaded. Please sync or check connection.</div>;
  }
  return (
    <select
      className="border rounded px-2 py-1"
      value={selectedEmployeeId || ''}
      onChange={e => {
        console.log('Employee selected (id):', e.target.value);
        onChange(e.target.value);
      }}
    >
      <option value="" disabled>Select employee</option>
      {employees.map(emp => (
        <option key={emp.id} value={emp.id}>
          {emp.full_name || emp.name || emp.email}
        </option>
      ))}
    </select>
  );
};

export default EmployeeSelect;
