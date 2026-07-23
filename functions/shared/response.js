/**
 * Standardized HTTP Response Helpers for Catalyst Functions
 */

function success(res, data, statusCode = 200, message = 'Success') {
  if (res && typeof res.status === 'function') {
    return res.status(statusCode).json({
      status: 'success',
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'success',
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString()
    })
  };
}

function error(res, message = 'Internal Server Error', statusCode = 500, details = null) {
  if (res && typeof res.status === 'function') {
    return res.status(statusCode).json({
      status: 'error',
      statusCode,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'error',
      statusCode,
      message,
      details,
      timestamp: new Date().toISOString()
    })
  };
}

module.exports = { success, error };
