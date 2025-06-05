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
  const [status, setStatus] = useState('Enter a model name to start scraping.');
  const [scrapedImages, setScrapedImages] = useState([]);
  const [scrapeComplete, setScrapeComplete] = useState(false); // New state to track completion
  const [progress, setProgress] = useState(0); // For total estimated posts (not fully integrated yet)
  const [estimatedTimeMessage, setEstimatedTimeMessage] = useState(''); // For estimated time
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null); // For auto-scrolling status messages

  // New state for "Coming soon" popup (from your original code)
  const [showComingSoon, setShowComingSoon] = useState(false); 

  // Function to handle "OnlyChat" button click (from your original code)
  const handleOnlyChatClick = () => {
    setShowComingSoon(true);
    setTimeout(() => {
      setShowComingSoon(false);
    }, 2000); // Disappear after 2 seconds
  };

  useEffect(() => {
    // --- SOCKET.IO CONNECTION ---
    // Ensure the socket connects to your backend URL
    socketRef.current = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });

    socketRef.current.on('connect', () => {
      console.log('Socket.IO Event: CONNECTED!');
      setStatus('Connected to backend. Enter a model name.');
    });

    socketRef.current.on('progress_update', (data) => {
      console.log('Socket.IO Event: Progress Update:', data.message);
      setStatus(prevStatus => {
        const newMessage = data.message;
        // Limit the number of status messages displayed for readability
        const statusLines = prevStatus.split('\n');
        if (statusLines.length > 10) { // Keep only the last 10 lines
          statusLines.shift();
        }
        return statusLines.join('\n') + `\n${newMessage}`;
      });
      // Optionally, you might update a progress bar here if you have one (using 'progress' state)
    });

    socketRef.current.on('image_scraped', (data) => {
      console.log('Socket.IO Event: Received scraped image URL:', data.imageUrl);
      setScrapedImages(prevImages => {
        // Prevent adding duplicate images if the same URL is emitted again
        if (!prevImages.some(img => img.imageUrl === data.imageUrl)) {
            return [...prevImages, data];
        }
        return prevImages;
      });
    });

    socketRef.current.on('scrape_complete', (data) => {
      console.log('Socket.IO Event: SCRAPE COMPLETE:', data.message);
      setStatus(prevStatus => prevStatus + `\n--- ${data.message} ---`);
      setScrapeComplete(true); // Set scrapeComplete to true on completion
    });

    socketRef.current.on('scrape_error', (data) => {
      console.error('Socket.IO Event: SCRAPE ERROR:', data.message);
      setStatus(prevStatus => prevStatus + `\nERROR: ${data.message}`);
      setScrapeComplete(true); // Also set complete on error to allow interaction
    });

    // Handle estimated time info
    socketRef.current.on('estimated_time_info', (data) => {
      const estimatedPosts = data.totalEstimatedPosts;
      // You can refine this estimation based on your observed average time per post
      const estimatedMinutes = Math.ceil(estimatedPosts / 50 * 0.5); // Example: 0.5 min per 50 posts
      setEstimatedTimeMessage(`Estimated total posts: ${estimatedPosts}. Estimated scraping time: ${estimatedMinutes} minutes.`);
    });


    socketRef.current.on('disconnect', () => {
      console.log('Socket.IO Event: DISCONNECTED!');
      setStatus(prevStatus => prevStatus + '\nDisconnected from backend.');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Auto-scroll messages to the bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [status]);


  const startScrape = async () => {
    if (!modelName) {
      setStatus('Please enter a model name.');
      return;
    }

    setStatus('Initiating scrape...');
    setScrapedImages([]); // Clear previous images
    setScrapeComplete(false); // Reset completion status
    setProgress(0); // Reset progress
    setEstimatedTimeMessage(''); // Reset estimated time

    try {
      const response = await fetch(`${BACKEND_URL}/api/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Socket-ID': socketRef.current.id, // Pass the socket ID in the header
        },
        body: JSON.stringify({ modelName }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus(`Scrape initiated: ${data.message}`);
      } else {
        setStatus(`Error initiating scrape: ${data.error}`);
      }
    } catch (error) {
      console.error('Error sending scrape request:', error);
      setStatus(`Network error: ${error.message}`);
    }
  };

  // Function to get a clean filename from a URL for the download attribute
  const getFilenameFromUrl = (url) => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      // Optional: Clean up any query parameters or Cloudinary transformation suffixes
      return filename.split('?')[0].split(',')[0] || 'download';
    } catch (e) {
      return 'download'; // Fallback filename
    }
  };


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
            // DISABLED IF SCRAPING, NOT CONNECTED, OR SOCKET ID IS NOT READY (Add logic back if needed)
            // disabled={isScraping || !isSocketConnected || !isSocketIdReady}
          />
          <button
            onClick={startScrape}
            style={styles.searchButton}
            // DISABLED IF SCRAPING, NOT CONNECTED, OR SOCKET ID IS NOT READY (Add logic back if needed)
            // style={(isScraping || !isSocketConnected || !isSocketIdReady) ? { ...styles.searchButton, ...styles.searchButtonDisabled } : styles.searchButton}
            // disabled={isScraping || !isSocketConnected || !isSocketIdReady}
          >
            Hack
          </button>
        </div>

        {estimatedTimeMessage && <p style={{ fontStyle: 'italic', color: '#666' }}>{estimatedTimeMessage}</p>}

        <div style={styles.statusContainer}>
          <p style={styles.statusMessage}>{status}</p>
          <div ref={messagesEndRef} /> {/* For auto-scrolling */}
        </div>

        <h2>Scraped Images</h2>
        <div style={styles.imageGridContainer}>
          {scrapedImages.length === 0 && <p>No images scraped yet.</p>}
          {scrapedImages.map((image, index) => (
            <div key={index} style={styles.scrapedImageItem}>
              {/* Download Link Wrapper */}
              <a
                href={image.imageUrl}
                download={getFilenameFromUrl(image.imageUrl)} // Suggest a filename for download
                target="_blank" // Opens in new tab
                rel="noopener noreferrer" // Security best practice
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

        {/* You can add a "Download All" button here, if you implement the backend ZIP logic */}
        {/*
        {scrapeComplete && scrapedImages.length > 0 && (
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
  searchButtonDisabled: { // Keeping this just in case you want to re-add disabled logic
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
  // --- NEW STYLES FOR SCRAPED IMAGES SECTION ---
  imageGridContainer: { // Renamed from 'imageGrid' for clarity
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    border: '1px solid #eee', // Changed from #ddd
    padding: '10px',
    minHeight: '100px',
    marginTop: '15px', // Added some margin
  },
  scrapedImageItem: {
    border: '1px solid #ddd',
    padding: '5px',
    borderRadius: '5px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)', // Subtle shadow
  },
  imageLink: { // Style for the <a> tag wrapping image and button
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textDecoration: 'none', // Remove underline
    color: 'inherit', // Inherit text color
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
    backgroundColor: '#28a745', // Green for download
    color: 'white',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
};

export default App;