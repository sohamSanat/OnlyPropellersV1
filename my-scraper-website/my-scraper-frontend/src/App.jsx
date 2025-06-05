// src/App.jsx

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// --- REQUIRED CODE CHANGE FOR BACKEND URL ---
// You will set this environment variable on Render, e.g., https://your-backend-app.onrender.com
// For local development, it will default to localhost:3000
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
// --- END REQUIRED CODE CHANGE ---


function App() {
  const [modelName, setModelName] = useState('');
  // This will be the main, high-level status message for the user.
  const [currentStatusMessage, setCurrentStatusMessage] = useState('Initializing...');
  const [isScraping, setIsScraping] = useState(false); // Tracks if a scrape is active
  const [scrapedImageUrls, setScrapedImageUrls] = useState([]); // Stores Cloudinary image URLs
  const [totalEstimatedPosts, setTotalEstimatedPosts] = useState(0); // From backend estimation
  const [remainingSeconds, setRemainingSeconds] = useState(0); // Countdown for scraping
  const [isSocketConnected, setIsSocketConnected] = useState(false); // Socket connection status
  const [isSocketIdReady, setIsSocketIdReady] = useState(false); // Indicates if socket.id is available

  const socketRef = useRef(null);
  // Removed messagesEndRef as we are no longer streaming verbose logs to UI
  const [showComingSoon, setShowComingSoon] = useState(false); // For "OnlyChat" popup


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

    // Add a small delay to check if ID becomes available shortly after connect
    const idCheckInterval = setInterval(() => {
        if (socketRef.current && socketRef.current.id && !isSocketIdReady) {
            setIsSocketIdReady(true);
            setCurrentStatusMessage('Ready to scrape. Enter a model name.'); // More concise ready message
        }
    }, 500);

    // This event is sent when master.js has estimated the total posts
    newSocket.on('estimated_time_info', (data) => {
      setTotalEstimatedPosts(data.totalEstimatedPosts);
      // Assuming each post takes approx. 3 seconds as per your checkNumberOfPages logic
      setRemainingSeconds(data.totalEstimatedPosts * 3);
      if (isScraping) { // Only update message if actively scraping
          setCurrentStatusMessage('Estimating total posts...');
      }
    });

    // This event is sent each time an image/video is scraped and uploaded
    newSocket.on('image_scraped', (data) => {
      setScrapedImageUrls(prevUrls => {
        if (!prevUrls.some(img => img.imageUrl === data.imageUrl)) {
            return [...prevUrls, data];
        }
        return prevUrls;
      });
      // Update status to show progress like "Scraping X of Y images..."
      setCurrentStatusMessage(`Scraping and Uploading... (${scrapedImageUrls.length + 1} images processed)`);
    });


    newSocket.on('scrape_complete', (data) => {
      setCurrentStatusMessage(`Scraping Complete: ${data.message}`);
      setIsScraping(false); // Reset scraping state
      setRemainingSeconds(0); // Reset timer
      setTotalEstimatedPosts(0); // Reset total posts estimation
      // Do NOT clear scrapedImageUrls here, user wants to see and download them
    });

    newSocket.on('scrape_error', (data) => {
      setCurrentStatusMessage(`Scraping Error: ${data.message}`);
      setIsScraping(false); // Reset scraping state on error
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
      // Do NOT clear scrapedImageUrls here
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

    // IMPORTANT: progress_update messages will now be ignored for currentStatusMessage
    // as they are backend logs and not user-facing status.
    newSocket.on('progress_update', (data) => {
      // For debugging in browser console (not shown in UI)
      console.log('Backend Progress (internal log):', data.message);
      // If you later want to show very specific, non-verbose updates from backend here,
      // you can add logic. But for now, these are treated as internal.
    });


    return () => {
      clearInterval(idCheckInterval);
      newSocket.disconnect();
    };
  }, []); // Empty dependency array means this runs once on mount

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

    // CRITICAL CHECKS: Input and button are disabled if socket not ready
    if (!isSocketConnected || !isSocketIdReady || !socketRef.current || !socketRef.current.id) {
        setCurrentStatusMessage('Error: Not connected to backend. Please wait or refresh.');
        return;
    }

    if (isScraping) {
      setCurrentStatusMessage('Scraping is already in progress!');
      return;
    }

    setIsScraping(true); // Set scraping state to true
    setCurrentStatusMessage('Initiating scrape...'); // Initial message when button is clicked
    setTotalEstimatedPosts(0); // Reset for new scrape
    setRemainingSeconds(0); // Reset for new scrape
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
      setCurrentStatusMessage(data.message); // Update status with initial message from backend
    } catch (error) {
      setCurrentStatusMessage(`Error initiating scrape: ${error.message}`);
      setIsScraping(false); // Reset scraping state on error
      setRemainingSeconds(0);
      setTotalEstimatedPosts(0);
    }
  };

  // Function to get a clean filename from a URL for the download attribute
  const getFilenameFromUrl = (url) => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      // Clean up any query parameters or Cloudinary transformation suffixes
      return filename.split('?')[0].split(',')[0] || 'download';
    } catch (e) {
      return 'download'; // Fallback filename
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

        {/* --- Events/Status Section (Streamlined) --- */}
        <div style={styles.statusContainer}>
          <p style={styles.statusMessage}>{currentStatusMessage}</p> {/* Main status message */}

          {/* Conditional display for estimated time and progress bar */}
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
              {/* Removed the confusing "Please check your download folder" message */}
            </>
          )}
          {/* Display a clear message after scrape complete/error if not actively scraping */}
          {!isScraping && (currentStatusMessage.includes("Complete") || currentStatusMessage.includes("Error")) && (
            <p style={{ fontSize: '0.85em', color: currentStatusMessage.includes("Error") ? 'red' : 'green', marginTop: '5px' }}>
              {currentStatusMessage.includes("Complete") ? 'Scraping session finished!' : 'Scraping session ended with an error.'}
            </p>
          )}
        </div>
        {/* --- END Events/Status Section --- */}

        <h2>Scraped Images</h2>
        <div style={styles.imageGridContainer}>
          {scrapedImageUrls.length === 0 && <p>No images scraped yet.</p>}
          {scrapedImageUrls.map((image, index) => (
            <div key={index} style={styles.scrapedImageItem}>
              <a
                href={image.imageUrl}
                download={getFilenameFromUrl(image.imageUrl)}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.imageLink}
              >
                <img
                  src={image.imageUrl}
                  alt={`Scraped Image ${index}`}
                  style={styles.scrapedImage}
                />
                <button style={styles.downloadButton}>
                  Download
                </button>
              </a>
            </div>
          ))}
        </div>

        {/* Optional: "Download All" button */}
        {/*
        {isScraping === false && scrapedImageUrls.length > 0 && (
            <button style={{ padding: '10px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', cursor: 'pointer', marginTop: '20px' }}>
                Download All Scraped Images (ZIP)
            </button>
        )}
        */}
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
  imageGridContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    border: '1px solid #eee',
    padding: '10px',
    minHeight: '100px',
    marginTop: '15px',
  },
  scrapedImageItem: {
    border: '1px solid #ddd',
    padding: '5px',
    borderRadius: '5px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  imageLink: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textDecoration: 'none',
    color: 'inherit',
  },
  scrapedImage: {
    width: '150px',
    height: '150px',
    objectFit: 'cover',
    borderRadius: '3px',
  },
  downloadButton: {
    marginTop: '5px',
    padding: '8px 12px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
};

export default App;
