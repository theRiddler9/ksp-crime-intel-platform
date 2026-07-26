/**
 * Standardized HTTP Response Helpers for Catalyst Functions
 */

function success(res, data, statusCode = 200, message = 'Success') {
  const payload = {
    status: 'success',
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString()
  };

  if (res && typeof res.status === 'function') {
    const statusObj = res.status(statusCode);
    if (typeof statusObj.json === 'function') {
      return statusObj.json(payload);
    } else if (typeof statusObj.send === 'function') {
      return statusObj.send(payload);
    }
  }
  
  // Basic I/O
  if (res && typeof res.write === 'function') {
    res.setStatusCode && res.setStatusCode(statusCode);
    res.write(JSON.stringify(payload));
    // context is usually the first arg, we assume basicIO closes itself or context is not passed here.
    // wait, basicIO does not have a close. the function should not hang if we return, but let's see.
    if (res.send) {
       res.send(JSON.stringify(payload));
    }
  }

  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function error(res, message = 'Internal Server Error', statusCode = 500, details = null) {
  const payload = {
    status: 'error',
    statusCode,
    message,
    details,
    timestamp: new Date().toISOString()
  };

  if (res && typeof res.status === 'function') {
    const statusObj = res.status(statusCode);
    if (typeof statusObj.json === 'function') {
      return statusObj.json(payload);
    } else if (typeof statusObj.send === 'function') {
      return statusObj.send(payload);
    }
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
