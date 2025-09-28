import React from 'react';
import Icon from '../../../components/AppIcon';

const ActivityFeed = ({ activities, loading = false }) => {
  const getActivityIcon = (type) => {
    switch (type) {
      case 'transaction':
        return 'DollarSign';
      case 'employee':
        return 'Users';
      case 'inventory':
        return 'Package';
      case 'alert':
        return 'AlertTriangle';
      case 'system':
        return 'Settings';
      default:
        return 'Activity';
    }
  };

  const getActivityColor = (type, priority) => {
    if (priority === 'high') return 'text-error';
    if (priority === 'medium') return 'text-warning';
    
    switch (type) {
      case 'transaction':
        return 'text-success';
      case 'employee':
        return 'text-primary';
      case 'inventory':
        return 'text-secondary';
      case 'alert':
        return 'text-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  const formatTime = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return time?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 shadow-card">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-32 mb-4"></div>
          <div className="space-y-4">
            {[...Array(5)]?.map((_, i) => (
              <div key={i} className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-muted rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
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
        <h3 className="text-lg font-semibold text-foreground">Live Activity</h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {activities?.map((activity) => (
          <div key={activity?.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
            <div className={`p-2 rounded-full bg-muted ${getActivityColor(activity?.type, activity?.priority)}`}>
              <Icon name={getActivityIcon(activity?.type)} size={14} />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground mb-1">
                {activity?.title}
              </p>
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                {activity?.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {formatTime(activity?.timestamp)}
                </span>
                {activity?.priority === 'high' && (
                  <span className="px-2 py-1 text-xs font-medium bg-error/10 text-error rounded-full">
                    High Priority
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <button className="w-full text-sm text-primary hover:text-primary/80 font-medium transition-smooth">
          View All Activities
        </button>
      </div>
    </div>
  );
};

export default ActivityFeed;