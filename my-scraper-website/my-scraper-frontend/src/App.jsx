// src/App.jsx

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// --- REQUIRED CODE CHANGE FOR BACKEND URL ---
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
// --- END REQUIRED CODE CHANGE ---


function App() {
  const [modelName, setModelName] = useState('');
  const [currentStatusMessage, setCurrentStatusMessage] = useState('Initializing...');
  const [isScraping, setIsScraping] = useState(false);
  // Keeping scrapedImageUrls state to know if content was found for "Download All" button logic
  const [scrapedImageUrls, setScrapedImageUrls] = useState([]);
  const [totalEstimatedPosts, setTotalEstimatedPosts] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isSocketIdReady, setIsSocketIdReady] = useState(false);

  const socketRef = useRef(null);
  const [showComingSoon, setShowComingSoon] = useState(false);


  // --- useEffect for Socket.IO connection and real-time data ---
  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setIsSocketConnected(true);
      if (newSocket.id) {
          setIsSocketIdReady(true);
          setCurrentStatusMessage('Program is up and ready for hack.');
      } else {
          setCurrentStatusMessage('Connected, but ID not ready. Please wait...');
      }
    });

    const idCheckInterval = setInterval(() => {
        if (socketRef.current && socketRef.current.id && !isSocketIdReady) {
            setIsSocketIdReady(true);
            setCurrentStatusMessage('Ready to scrape. Enter a model name.');
        }
    }, 500);

    newSocket.on('estimated_time_info', (data) => {
      setTotalEstimatedPosts(data.totalEstimatedPosts);
      setRemainingSeconds(data.totalEstimatedPosts * 3);
      if (isScraping) {
          setCurrentStatusMessage('Estimating total posts...');
      }
    });

    newSocket.on('image_scraped', (data) => {
      // Still store the URLs, even if not displayed, to know what to download later
      setScrapedImageUrls(prevUrls => {
        if (!prevUrls.some(img => img.imageUrl === data.imageUrl)) {
            return [...prevUrls, data];
        }
        return prevUrls;
      });
      setCurrentStatusMessage(`Scraping and Uploading... (${scrapedImageUrls.length + 1} images processed)`);
    });


    newSocket.on('scrape_complete', (data) => {
      setCurrentStatusMessage(`Scraping Complete: ${data.message}`);
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
      // Images are stored in scrapedImageUrls, available for download button
    });

    newSocket.on('scrape_error', (data) => {
      setCurrentStatusMessage(`Scraping Error: ${data.message}`);
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
    });

    newSocket.on('disconnect', (reason) => {
      setIsSocketConnected(false);
      setIsSocketIdReady(false);
      setCurrentStatusMessage('Disconnected. Please refresh if issues persist.');
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
      setScrapedImageUrls([]); // Clear images on full disconnect
    });

    newSocket.on('reconnect', (attemptNumber) => {
        setIsSocketConnected(true);
        if (newSocket.id) {
            setIsSocketIdReady(true);
            setCurrentStatusMessage('Reconnected. Ready to scrape.');
        }
    });

    newSocket.on('reconnect_error', (error) => {
        setCurrentStatusMessage('Reconnect error. Check backend.');
    });

    newSocket.on('connect_error', (error) => {
        setCurrentStatusMessage(`Connection error: ${error.message}. Please refresh.`);
        setIsSocketConnected(false);
        setIsSocketIdReady(false);
    });

    // progress_update messages are treated as internal logs and not displayed in the UI.
    newSocket.on('progress_update', (data) => {
      console.log('Backend Progress (internal log):', data.message);
    });


    return () => {
      clearInterval(idCheckInterval);
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
    }, 2000);
  };

  const formatTime = (totalSeconds) => {
    if (totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const handleScrape = async () => {
    if (!modelName) {
      setCurrentStatusMessage('Please enter an OF model username.');
      return;
    }

    if (!isSocketConnected || !isSocketIdReady || !socketRef.current || !socketRef.current.id) {
        setCurrentStatusMessage('Error: Not connected to backend. Please wait or refresh.');
        return;
    }

    if (isScraping) {
      setCurrentStatusMessage('Scraping is already in progress!');
      return;
    }

    setIsScraping(true);
    setCurrentStatusMessage('Initiating scrape...');
    setTotalEstimatedPosts(0);
    setRemainingSeconds(0);
    setScrapedImageUrls([]); // Clear previously scraped images for new scrape

    try {
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
        throw new Error(errorMessage);
      }
      setCurrentStatusMessage(data.message);
    } catch (error) {
      setCurrentStatusMessage(`Error initiating scrape: ${error.message}`);
      setIsScraping(false);
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
    }
  };

  const handleDownloadAll = async () => {
    if (!modelName) {
      setCurrentStatusMessage('Please enter the model name first to download.');
      return;
    }
    if (scrapedImageUrls.length === 0) {
        setCurrentStatusMessage('No images were scraped for this model yet to download.');
        return;
    }
    setCurrentStatusMessage(`Preparing download for ${modelName}'s content...`);

    // --- IMPORTANT: This URL needs to be implemented on your backend! ---
    // It should trigger the backend to zip up all contents for 'modelName'
    const downloadUrl = `${BACKEND_URL}/api/download-all-model?modelName=${encodeURIComponent(modelName)}`;

    try {
        // We'll let the browser handle the download directly from the backend
        window.open(downloadUrl, '_blank');
        setCurrentStatusMessage(`Download initiated for ${modelName}. Check your browser's downloads.`);
    } catch (error) {
        setCurrentStatusMessage(`Failed to initiate download: ${error.message}`);
    }
  };


  return (
    <div style={styles.body}>
      <div style={styles.headerContainer}>
        <div style={styles.logo}>OnlyPropellers</div>
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
            <span style={styles.lockIcon}>&#128274;</span>
            Only<span style={styles.fansText}>Fans</span>
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
            disabled={isScraping || !isSocketConnected || !isSocketIdReady}
          />
          <button
            onClick={handleScrape}
            style={ (isScraping || !isSocketConnected || !isSocketIdReady) ? {...styles.searchButton, ...styles.searchButtonDisabled} : styles.searchButton }
            disabled={isScraping || !isSocketConnected || !isSocketIdReady}
          >
            {isScraping ? 'Searching...' : 'Hack'}
          </button>
        </div>

        {/* --- Events/Status Section --- */}
        <div style={styles.statusContainer}>
          <p style={styles.statusMessage}>{currentStatusMessage}</p>

          {isScraping && (
            <>
              {totalEstimatedPosts > 0 && remainingSeconds > 0 && (
                <div style={styles.countdownDisplay}>
                  <span>
                    Estimated Time Left: <span style={styles.countdownTimeText}>{formatTime(remainingSeconds)}</span>
                  </span>
                </div>
              )}
              {totalEstimatedPosts > 0 && (
                <p style={{ fontSize: '1em', color: '#007bff', fontWeight: 'bold', marginTop: '5px' }}>
                  Stealing {totalEstimatedPosts} posts...
                </p>
              )}
              {totalEstimatedPosts > 0 && (
                <div style={styles.progressBarContainer}>
                  <div style={{ ...styles.progressBarFill, width: `${(totalEstimatedPosts * 3 - remainingSeconds) / (totalEstimatedPosts * 3) * 100}%` }}></div>
                </div>
              )}
            </>
          )}
          {!isScraping && (currentStatusMessage.includes("Complete") || currentStatusMessage.includes("Error")) && (
            <p style={{ fontSize: '0.85em', color: currentStatusMessage.includes("Error") ? 'red' : 'green', marginTop: '5px' }}>
              {currentStatusMessage.includes("Complete") ? 'Scraping session finished!' : 'Scraping session ended with an error.'}
            </p>
          )}
        </div>
        {/* --- END Events/Status Section --- */}

        {/* --- Download All Button --- */}
        {!isScraping && scrapedImageUrls.length > 0 && (
            <button
                onClick={handleDownloadAll}
                style={{ ...styles.searchButton, marginTop: '30px', backgroundColor: '#28a745', padding: '12px 25px' }}
                disabled={!modelName || scrapedImageUrls.length === 0 || isScraping}
            >
                Download All Scraped Content ({scrapedImageUrls.length} files)
            </button>
        )}
        {/* --- END Download All Button --- */}

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
  buttonWrapper: {
    position: 'relative',
    display: 'inline-block',
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
  },
  comingSoonPopup: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
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
