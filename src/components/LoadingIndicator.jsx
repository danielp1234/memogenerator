// src/components/LoadingIndicator.jsx
import React from "react";

function LoadingIndicator() {
  return (
    <div className="loading-indicator">
      <div className="spinner"></div>
      <p>Generating memorandum... This may take a few moments.</p>
    </div>
  );
}

export default LoadingIndicator;
