// src/App.jsx

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// src/App.jsx

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// --- REQUIRED CODE CHANGE FOR BACKEND URL ---
// This will use the VITE_BACKEND_URL environment variable you set on Render.
// During local development, it will fall back to 'http://localhost:3000'.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
// --- END OF REQUIRED CODE CHANGE FOR BACKEND URL ---


function App() {
  const [modelName, setModelName] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const socketRef = useRef(null); // Use useRef for the socket instance

  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [currentStatusMessage, setCurrentStatusMessage] = useState('Initializing...');
  const [totalEstimatedPosts, setTotalEstimatedPosts] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // NEW STATE: To track if socket.id is actually ready
  const [isSocketIdReady, setIsSocketIdReady] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false); // New state for "Coming soon" popup

  // --- useEffect for Socket.IO connection and real-time data ---
  useEffect(() => {
    console.log('Socket Init: Starting Socket.IO connection attempt...');
    const newSocket = io(BACKEND_URL);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('Socket.IO Event: CONNECTED! Full socket object:', newSocket);
      console.log('Socket.IO connected ID (from event):', newSocket.id);
      setIsSocketConnected(true);
      if (newSocket.id) {
          setIsSocketIdReady(true); // Set ready when ID is confirmed on connect
          setCurrentStatusMessage('Program is up and ready for hack.');
      } else {
          console.warn('Socket.IO connected, but ID is not immediately available on connect event.');
          setCurrentStatusMessage('Connected, but ID not ready. Please wait...');
      }
    });

    // Add a small delay to check if ID becomes available shortly after connect
    const idCheckInterval = setInterval(() => {
        if (socketRef.current && socketRef.current.id && !isSocketIdReady) {
            console.log('Socket.IO Deferred Check: ID became available:', socketRef.current.id);
            setIsSocketIdReady(true);
            setCurrentStatusMessage('Please wait for couple of seconds for download to start.');
        } else if (socketRef.current && !socketRef.current.id) {
            console.log('Socket.IO Deferred Check: ID still undefined. Current state:', socketRef.current);
        }
    }, 500); // Check every 500ms for a few seconds

    newSocket.on('estimated_time_info', (data) => {
      console.log('Socket.IO Event: Received estimated time info:', data);
      setTotalEstimatedPosts(data.totalEstimatedPosts);
      setRemainingSeconds(data.totalEstimatedPosts * 3);
      if (isScraping) {
          setCurrentStatusMessage('Estimating total posts...');
      }
    });

    newSocket.on('scrape_complete', (data) => {
      console.log('Socket.IO Event: Scraping Completed:', data.message);
      setCurrentStatusMessage(`Scraping Complete: ${data.message}`);
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
    });

    newSocket.on('scrape_error', (data) => {
      console.error('Socket.IO Event: Scraping Error:', data.message);
      setCurrentStatusMessage(`Scraping Error: ${data.message}`);
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket.IO Event: DISCONNECTED! Reason:', reason);
      setIsSocketConnected(false);
      setIsSocketIdReady(false); // Reset ID readiness
      setCurrentStatusMessage('Disconnected. Please refresh if issues persist.');
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
      // REMOVED: setFakeHackerEventText('');
    });

    newSocket.on('reconnect', (attemptNumber) => {
        console.log(`Socket.IO Event: Reconnected after ${attemptNumber} attempts`);
        setIsSocketConnected(true);
        if (newSocket.id) {
            setIsSocketIdReady(true);
            setCurrentStatusMessage('Reconnected. Ready to search.');
        } else {
            console.warn('Socket.IO reconnected, but ID is not immediately available.');
        }
    });

    newSocket.on('reconnect_error', (error) => {
        console.error('Socket.IO Event: Reconnect error:', error);
        setCurrentStatusMessage('Reconnect error. Check backend.');
    });

    newSocket.on('connect_error', (error) => {
        console.error('Socket.IO Event: Initial connection error:', error);
        setCurrentStatusMessage(`Connection error: ${error.message}`);
        setIsSocketConnected(false); // Ensure connection state is false
        setIsSocketIdReady(false); // Ensure ID readiness is false
    });

    return () => {
      console.log('Socket Cleanup: Disconnecting Socket.IO...');
      clearInterval(idCheckInterval); // Clear the interval on unmount
      newSocket.disconnect();
    };
  }, []);

  // --- useEffect for Countdown Timer ---
  useEffect(() => {
    let timerId;
    if (isScraping && totalEstimatedPosts > 0 && remainingSeconds > 0) {
      timerId = setInterval(() => {
        setRemainingSeconds(prevSeconds => prevSeconds - 1);
      }, 1000);
    } else if (remainingSeconds <= 0 && isScraping) {
        setRemainingSeconds(0);
    }
    return () => clearInterval(timerId);
  }, [isScraping, remainingSeconds, totalEstimatedPosts]);

  const handleOnlyChatClick = () => {
    setShowComingSoon(true);
    setTimeout(() => {
      setShowComingSoon(false);
    }, 2000); // Disappear after 5 seconds
  };

  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const handleScrape = async () => {
    console.log('handleScrape: Function triggered.');

    if (!modelName) {
      // Replaced alert with console.warn as per instructions
      console.warn('Please enter an OF model username.');
      // You might want to update a state variable to display an error message in the UI instead of alert
      setCurrentStatusMessage('Error: Please enter an OF model username.');
      return;
    }

    // CRITICAL CHECKS: Now using isSocketIdReady state
    console.log('handleScrape DEBUG: isSocketConnected:', isSocketConnected);
    console.log('handleScrape DEBUG: isSocketIdReady:', isSocketIdReady);
    console.log('handleScrape DEBUG: socketRef.current value:', socketRef.current);
    console.log('handleScrape DEBUG: socketRef.current.id value:', socketRef.current ? socketRef.current.id : 'ID is NULL/UNDEFINED');

    if (!isSocketConnected || !isSocketIdReady || !socketRef.current || !socketRef.current.id) {
        setCurrentStatusMessage('Error: Not connected to backend or ID not ready. Please wait or refresh.');
        console.error('handleScrape ERROR: Socket connection or ID not ready. Cannot initiate scrape.');
        return;
    }

    if (isScraping) {
      // Replaced alert with console.warn as per instructions
      console.warn('Scraping is already in progress!');
      setCurrentStatusMessage('Scraping is already in progress!');
      return;
    }

    setIsScraping(true);
    setCurrentStatusMessage('Estimating total posts...');
    setTotalEstimatedPosts(0);
    setRemainingSeconds(0);

    setRemainingSeconds(0);
    console.log('DEBUG: handleScrape - Before fetch call. isSocketConnected:', isSocketConnected);
    console.log('DEBUG: handleScrape - Before fetch call. isSocketIdReady:', isSocketIdReady);
    console.log('DEBUG: handleScrape - Before fetch call. socketRef.current.id:', socketRef.current ? socketRef.current.id : 'N/A');

    try {
      console.log(`handleScrape: Sending fetch request for model: ${modelName} with socket ID: ${socketRef.current.id}`);
      const response = await fetch(`${BACKEND_URL}/api/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-socket-id': socketRef.current.id
        },
        body: JSON.stringify({ modelName }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.error || 'Failed to start scraping (unknown error)';
        console.error('handleScrape ERROR: Backend response not OK:', errorMessage);
        throw new Error(errorMessage);
      }
      console.log('handleScrape: Scrape request sent successfully:', data.message);
    } catch (error) {
      console.error('handleScrape ERROR: Error sending scrape request:', error);
      setCurrentStatusMessage(`Error initiating scrape: ${error.message}`);
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
    }
  };

  const displayedMessage = currentStatusMessage;

  const shouldShowStatusContent = isScraping || displayedMessage.includes("Scraping Complete") || displayedMessage.includes("Scraping Error") || displayedMessage.includes("Disconnected") || displayedMessage.includes("Please wait for couple of seconds for download to start.");

  // Calculate progress for the progress bar
  const progress = totalEstimatedPosts > 0 ? ((totalEstimatedPosts * 3 - remainingSeconds) / (totalEstimatedPosts * 3)) * 100 : 0;

  return (
    <div style={styles.body}>
      <div style={styles.headerContainer}>
        <div style={styles.logo}>OnlyPropellers</div>
        {/* Wrap the button and popup in a div that is positioned relative */}
        <div style={styles.buttonWrapper}>
          <button style={styles.addButton} onClick={handleOnlyChatClick}>OnlyChat</button>
          {showComingSoon && (
            <div style={styles.comingSoonPopup}>
              Coming soon
            </div>
          )}
        </div>
      </div>

      <div style={styles.mainContent}>
        <h1 style={styles.title}>
          Hack{' '}
          <span style={styles.onlyfansLogo}>
            <span style={styles.lockIcon}>&#128274;</span>Only<span style={styles.fansText}>Fans</span>
          </span>{' '}
          Profiles
        </h1>
        <p style={styles.subtitle}>Get latest posts of any OnlyFans model for free </p>

        <div style={styles.searchBarContainer}>
          <span style={styles.searchIcon}>&#128269;</span>
          <input
            type="text"
            placeholder="Username of model..."
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            style={styles.searchInput}
            // DISABLED IF SCRAPING, NOT CONNECTED, OR SOCKET ID IS NOT READY
            disabled={isScraping || !isSocketConnected || !isSocketIdReady}
          />
          <button
            onClick={handleScrape}
            style={(isScraping || !isSocketConnected || !isSocketIdReady) ? { ...styles.searchButton, ...styles.searchButtonDisabled } : styles.searchButton}
            // DISABLED IF SCRAPING, NOT CONNECTED, OR SOCKET ID IS NOT READY
            disabled={isScraping || !isSocketConnected || !isSocketIdReady}
          >
            {isScraping ? 'Searching...' : 'Hack'}
          </button>
        </div>

        <div style={styles.statusContainer}>
          {shouldShowStatusContent ? (
            <>
              <p style={styles.statusMessage}>{displayedMessage}</p>

              <div style={styles.countdownDisplay}>
                {isScraping && totalEstimatedPosts > 0 && remainingSeconds > 0 && (
                  <span>
                    Estimated Time Left: <span style={styles.countdownTimeText}>{formatTime(remainingSeconds)}</span>
                  </span>
                )}
                {isScraping && totalEstimatedPosts === 0 && currentStatusMessage === 'Estimating total posts...' && (
                  <span>Estimating total posts...</span>
                )}
              </div>
              {isScraping && totalEstimatedPosts > 0 && (
                <p style={{ fontSize: '1em', color: '#007bff', fontWeight: 'bold', marginTop: '5px' }}>
                  Stealing {totalEstimatedPosts} posts...
                </p>
              )}
              {isScraping && totalEstimatedPosts > 0 && (
                <div style={styles.progressBarContainer}>
                  <div style={{ ...styles.progressBarFill, width: `${progress}%` }}></div>
                </div>
              )}
              {isScraping && (
                <p style={{ fontSize: '0.85em', color: '#777', marginTop: '5px', color: "rgb(237, 10, 10)" }}>
                  Please check your download folder and find a folder called "OnlyFans Hacker"
                </p>
              )}
            </>
          ) : (
            <div style={{minHeight: '86px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc'}}>
                Status updates will appear here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  body: {
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#FFFFFF',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    color: '#333',
    overflowY: 'scroll',
  },
  headerContainer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 50px',
    boxSizing: 'border-box',
    maxWidth: '1200px',
  },
  logo: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#007bff',
  },
  // NEW STYLE: Wrapper for the button and popup
  buttonWrapper: {
    position: 'relative', // This is the key! Make the wrapper relative.
    display: 'inline-block', // To make it wrap its content
  },
  addButton: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '25px',
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: 'bold',
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
    transition: 'background-color 0.2s ease',
    // position: 'relative', // Removed from here, moved to buttonWrapper
  },
  comingSoonPopup: {
    position: 'absolute',
    top: 'calc(100% + 10px)', // Position below the button
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#333',
    color: 'white',
    padding: '8px 15px',
    borderRadius: '5px',
    fontSize: '0.9em',
    whiteSpace: 'nowrap',
    zIndex: 1000,
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
  },
  mainContent: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '90%',
    maxWidth: '700px',
    textAlign: 'center',
    paddingBottom: '50px',
  },
  title: {
    fontSize: '2.7em',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  onlyfansLogo: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#007bff',
    fontWeight: 'bold',
    fontSize: '1.1em',
  },
  lockIcon: {
    marginRight: '4px',
    fontSize: '0.75em',
    color: '#007bff',
  },
  fansText: {
    fontFamily: 'cursive',
    fontWeight: 'bold',
    color: '#007bff',
    fontSize: '0.85em',
  },
  subtitle: {
    fontSize: '1.1em',
    color: '#666',
    marginBottom: '35px',
  },
  searchBarContainer: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '500px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #ddd',
    borderRadius: '30px',
    padding: '8px 18px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  searchIcon: {
    fontSize: '18px',
    color: '#999',
    marginRight: '8px',
  },
  searchInput: {
    flexGrow: 1,
    border: 'none',
    outline: 'none',
    fontSize: '15px',
    padding: '4px 0',
    backgroundColor: 'transparent',
    color: '#333',
  },
  searchButton: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '22px',
    padding: '8px 22px',
    fontSize: '15px',
    cursor: 'pointer',
    fontWeight: 'bold',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    transition: 'background-color 0.2s ease',
  },
  searchButtonDisabled: {
    backgroundColor: '#a0a0a0',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  statusContainer: {
    marginTop: '25px',
    width: '100%',
    maxWidth: '500px',
    backgroundColor: '#f9f9f9',
    border: '1px solid #eee',
    borderRadius: '8px',
    padding: '12px 18px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '86px',
  },
  statusMessage: {
    fontSize: '1.0em',
    color: '#444',
    fontWeight: '600',
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  countdownDisplay: {
    fontSize: '0.9em',
    color: '#555',
    minHeight: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownTimeText: {
    fontSize: '1.2em',
    fontWeight: 'bold',
    color: '#007bff',
    marginLeft: '4px',
  },
  progressBarContainer: {
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: '5px',
    height: '10px',
    overflow: 'hidden',
    marginTop: '10px',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#007bff',
    borderRadius: '5px',
    transition: 'width 0.5s ease-in-out',
  },
};

export default App;
