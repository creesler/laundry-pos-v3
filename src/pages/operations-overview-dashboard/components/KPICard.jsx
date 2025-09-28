import React from 'react';
import Icon from '../../../components/AppIcon';

const KPICard = ({ title, value, change, changeType, icon, color = 'primary', loading = false }) => {
  const getChangeColor = () => {
    if (changeType === 'positive') return 'text-success';
    if (changeType === 'negative') return 'text-error';
    return 'text-muted-foreground';
  };

  const getChangeIcon = () => {
    if (changeType === 'positive') return 'TrendingUp';
    if (changeType === 'negative') return 'TrendingDown';
    return 'Minus';
  };

  const getColorClasses = () => {
    switch (color) {
      case 'success':
        return 'bg-success/10 text-success border-success/20';
      case 'warning':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'error':
        return 'bg-error/10 text-error border-error/20';
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 shadow-card">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 bg-muted rounded w-24"></div>
            <div className="h-8 w-8 bg-muted rounded-lg"></div>
          </div>
          <div className="h-8 bg-muted rounded w-32 mb-2"></div>
          <div className="h-4 bg-muted rounded w-20"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-card hover:shadow-modal transition-smooth">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className={`p-2 rounded-lg border ${getColorClasses()}`}>
          <Icon name={icon} size={20} />
        </div>
      </div>
      
      <div className="space-y-2">
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        
        {change && (
          <div className="flex items-center space-x-1">
            <Icon name={getChangeIcon()} size={14} className={getChangeColor()} />
            <span className={`text-sm font-medium ${getChangeColor()}`}>
              {change}
            </span>
            <span className="text-sm text-muted-foreground">vs yesterday</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default KPICard;