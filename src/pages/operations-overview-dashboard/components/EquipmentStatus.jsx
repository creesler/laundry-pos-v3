import React from 'react';
import Icon from '../../../components/AppIcon';

const EquipmentStatus = ({ equipment, loading = false }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'text-success';
      case 'idle':
        return 'text-warning';
      case 'maintenance':
        return 'text-error';
      case 'offline':
        return 'text-muted-foreground';
      default:
        return 'text-secondary';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'running':
        return 'bg-success/10';
      case 'idle':
        return 'bg-warning/10';
      case 'maintenance':
        return 'bg-error/10';
      case 'offline':
        return 'bg-muted';
      default:
        return 'bg-secondary/10';
    }
  };

  const getEquipmentIcon = (type) => {
    switch (type) {
      case 'washer':
        return 'Droplets';
      case 'dryer':
        return 'Wind';
      case 'folder':
        return 'Package2';
      default:
        return 'Settings';
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 shadow-card">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-32 mb-4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)]?.map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-muted rounded-lg"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-16"></div>
                    <div className="h-3 bg-muted rounded w-12"></div>
                  </div>
                </div>
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
        <h3 className="text-lg font-semibold text-foreground">Equipment Status</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-success">
            {equipment?.filter(eq => eq?.status === 'running')?.length} running
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-sm text-error">
            {equipment?.filter(eq => eq?.status === 'maintenance')?.length} maintenance
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipment?.map((item) => (
          <div key={item?.id} className={`p-4 rounded-lg border transition-smooth hover:shadow-card ${getStatusBg(item?.status)}`}>
            <div className="flex items-center space-x-3 mb-3">
              <div className={`p-2 rounded-lg ${getStatusBg(item?.status)} ${getStatusColor(item?.status)}`}>
                <Icon name={getEquipmentIcon(item?.type)} size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {item?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item?.type} • {item?.location}
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status:</span>
                <span className={`text-xs font-medium capitalize ${getStatusColor(item?.status)}`}>
                  {item?.status}
                </span>
              </div>
              
              {item?.timeRemaining && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Time left:</span>
                  <span className="text-xs font-medium text-foreground">
                    {item?.timeRemaining}
                  </span>
                </div>
              )}
              
              {item?.lastMaintenance && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Last service:</span>
                  <span className="text-xs text-foreground">
                    {item?.lastMaintenance}
                  </span>
                </div>
              )}
            </div>
            
            {item?.status === 'maintenance' && (
              <button className="mt-3 w-full px-3 py-1 text-xs bg-error text-error-foreground rounded hover:bg-error/90 transition-smooth">
                Schedule Repair
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EquipmentStatus;