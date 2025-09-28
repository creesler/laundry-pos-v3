import React from 'react';
import Icon from '../../../components/AppIcon';

const EmployeeStatus = ({ employees, loading = false }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-success text-success-foreground';
      case 'break':
        return 'bg-warning text-warning-foreground';
      case 'offline':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return 'CheckCircle';
      case 'break':
        return 'Clock';
      case 'offline':
        return 'XCircle';
      default:
        return 'User';
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 shadow-card">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(4)]?.map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-muted rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-24"></div>
                  <div className="h-3 bg-muted rounded w-16"></div>
                </div>
                <div className="h-6 w-16 bg-muted rounded-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Employee Status</h3>
        <span className="text-sm text-muted-foreground">
          {employees?.filter(emp => emp?.status === 'active')?.length} active
        </span>
      </div>
      <div className="space-y-3">
        {employees?.map((employee) => (
          <div key={employee?.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
            <div className="relative">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                <Icon name="User" size={16} className="text-muted-foreground" />
              </div>
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card ${getStatusColor(employee?.status)} flex items-center justify-center`}>
                <Icon name={getStatusIcon(employee?.status)} size={8} />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {employee?.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {employee?.role} • {employee?.shift}
              </p>
            </div>
            
            <div className="text-right">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(employee?.status)}`}>
                {employee?.status}
              </span>
              {employee?.clockIn && (
                <p className="text-xs text-muted-foreground mt-1">
                  {employee?.clockIn}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <button className="w-full text-sm text-primary hover:text-primary/80 font-medium transition-smooth">
          Manage Employees
        </button>
      </div>
    </div>
  );
};

export default EmployeeStatus;