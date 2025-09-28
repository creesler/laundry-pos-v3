import React from 'react';
import Icon from '../../../components/AppIcon';

const ServiceQueue = ({ queues, loading = false }) => {
  const getQueueColor = (status, count) => {
    if (status === 'critical' || count > 10) return 'text-error';
    if (status === 'warning' || count > 5) return 'text-warning';
    return 'text-success';
  };

  const getQueueIcon = (type) => {
    switch (type) {
      case 'wash':
        return 'Droplets';
      case 'dry':
        return 'Wind';
      case 'fold':
        return 'Package2';
      case 'pickup':
        return 'ShoppingBag';
      default:
        return 'Clock';
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 shadow-card">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-32 mb-4"></div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)]?.map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-muted rounded w-16"></div>
                <div className="h-8 bg-muted rounded w-12"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
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
        <h3 className="text-lg font-semibold text-foreground">Service Queue</h3>
        <Icon name="RefreshCw" size={16} className="text-muted-foreground hover:text-foreground cursor-pointer transition-smooth" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {queues?.map((queue) => (
          <div key={queue?.type} className="text-center p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth">
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${getQueueColor(queue?.status, queue?.count) === 'text-error' ? 'bg-error/10' : getQueueColor(queue?.status, queue?.count) === 'text-warning' ? 'bg-warning/10' : 'bg-success/10'}`}>
              <Icon 
                name={getQueueIcon(queue?.type)} 
                size={20} 
                className={getQueueColor(queue?.status, queue?.count)}
              />
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground capitalize">
                {queue?.type}
              </p>
              <p className={`text-2xl font-bold ${getQueueColor(queue?.status, queue?.count)}`}>
                {queue?.count}
              </p>
              <p className="text-xs text-muted-foreground">
                {queue?.avgWait} avg wait
              </p>
            </div>
            
            {queue?.count > 0 && (
              <button className="mt-3 px-3 py-1 text-xs bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-smooth">
                View Queue
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total in queue:</span>
          <span className="font-medium text-foreground">
            {queues?.reduce((sum, queue) => sum + queue?.count, 0)} items
          </span>
        </div>
      </div>
    </div>
  );
};

export default ServiceQueue;