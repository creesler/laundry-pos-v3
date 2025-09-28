import React from 'react';
import ReactDOM from 'react-dom';

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <button 
          onClick={onClose} 
          style={closeButtonStyle}
          aria-label="Close modal"
        >
          ×
        </button>
        <div style={contentStyle}>
          {children}
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

// Styles
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const modalStyle = {
  backgroundColor: 'white',
  borderRadius: '8px',
  padding: '20px',
  minWidth: '300px',
  maxWidth: '90%',
  maxHeight: '90vh',
  overflowY: 'auto',
  position: 'relative',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
};

const closeButtonStyle = {
  position: 'absolute',
  top: '10px',
  right: '10px',
  background: 'none',
  border: 'none',
  fontSize: '24px',
  cursor: 'pointer',
  padding: '0 8px',
  color: '#666',
};

const contentStyle = {
  marginTop: '20px',
};

export default Modal;
