import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io();

function App() {
  const [modelName, setModelName] = useState("");
  const [currentStatusMessage, setCurrentStatusMessage] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedImageUrls, setScrapedImageUrls] = useState([]);
  const [totalEstimatedPosts, setTotalEstimatedPosts] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isSocketIdReady, setIsSocketIdReady] = useState(false);
  const [scrapeComplete, setScrapeComplete] = useState(false);

  const timerRef = useRef(null);

  useEffect(() => {
    socket.on("connect", () => {
      setIsSocketConnected(true);
      setIsSocketIdReady(true);
    });

    socket.on("disconnect", () => {
      setIsSocketConnected(false);
      setIsSocketIdReady(false);
    });

    socket.on("estimated_time_info", (data) => {
      setTotalEstimatedPosts(data.totalEstimatedPosts);
      setRemainingSeconds(data.estimatedSecondsLeft);
      setCurrentStatusMessage("Estimating posts...");
      setScrapeComplete(false);
    });

    socket.on("image_scraped", (data) => {
      setScrapedImageUrls((prev) => [...prev, data.url]);
      setCurrentStatusMessage("Scraping and Uploading...");
    });

    socket.on("scrape_complete", () => {
      setCurrentStatusMessage("Scraping Completed!");
      setIsScraping(false);
      setScrapeComplete(true);
      clearInterval(timerRef.current);
      setRemainingSeconds(0);
    });

    socket.on("scrape_error", (error) => {
      setCurrentStatusMessage(`Error: ${error.message || "Unknown error"}`);
      setIsScraping(false);
      setScrapeComplete(true);
      clearInterval(timerRef.current);
      setRemainingSeconds(0);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("estimated_time_info");
      socket.off("image_scraped");
      socket.off("scrape_complete");
      socket.off("scrape_error");
      clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (remainingSeconds > 0 && isScraping) {
      timerRef.current = setInterval(() => {
        setRemainingSeconds((sec) => {
          if (sec <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return sec - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [remainingSeconds, isScraping]);

  const handleScrape = async () => {
    if (!modelName.trim()) return alert("Please enter a model name");
    if (!isSocketConnected || !isSocketIdReady)
      return alert("Socket connection not ready. Please wait.");

    setIsScraping(true);
    setScrapeComplete(false);
    setScrapedImageUrls([]);
    setTotalEstimatedPosts(0);
    setRemainingSeconds(0);
    setCurrentStatusMessage("Starting scrape...");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          socketid: socket.id,
        },
        body: JSON.stringify({ modelName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to start scraping");
      }
    } catch (error) {
      setCurrentStatusMessage(`Error: ${error.message}`);
      setIsScraping(false);
      setScrapeComplete(true);
    }
  };

  const handleDownloadAll = () => {
    if (!scrapeComplete) return;
    window.open(
      `/api/download-all-model?modelName=${encodeURIComponent(modelName)}`,
      "_blank"
    );
  };

  const progressPercent =
    totalEstimatedPosts > 0
      ? Math.min(100, (scrapedImageUrls.length / totalEstimatedPosts) * 100)
      : 0;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div style={styles.body}>
      <header style={styles.headerContainer}>
        <div style={styles.logo}>OnlyFans Scraper</div>
        {/* AddButton example - you can remove or customize */}
        {/* <div style={styles.buttonWrapper}>
          <button style={styles.addButton}>Add</button>
        </div> */}
      </header>

      <main style={styles.mainContent}>
        <h1 style={styles.title}>
          <span style={styles.lockIcon}>🔒</span>
          Only
          <span style={styles.onlyfansLogo}>
            Fans
            <span style={styles.fansText}>Scraper</span>
          </span>
        </h1>
        <p style={styles.subtitle}>Enter a model's username to start scraping.</p>

        <div style={styles.searchBarContainer}>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="Enter model username"
            disabled={isScraping}
            style={styles.searchInput}
          />
          <button
            onClick={handleScrape}
            disabled={isScraping || !isSocketConnected}
            style={{
              ...styles.searchButton,
              ...(isScraping || !isSocketConnected
                ? styles.searchButtonDisabled
                : {}),
            }}
          >
            Hack
          </button>
        </div>

        {(isScraping || scrapeComplete) && (
          <div style={styles.statusContainer}>
            <p style={styles.statusMessage}>{currentStatusMessage}</p>

            {!scrapeComplete && (
              <>
                <div style={styles.countdownDisplay}>
                  Estimated Time Left:
                  <span style={styles.countdownTimeText}>
                    {" "}
                    {formatTime(remainingSeconds)}
                  </span>
                </div>

                <div style={styles.progressBarContainer}>
                  <div
                    style={{
                      ...styles.progressBarFill,
                      width: `${progressPercent}%`,
                    }}
                  />
                </div>

                <p>
                  {scrapedImageUrls.length} / {totalEstimatedPosts} posts
                  scraped
                </p>
              </>
            )}
          </div>
        )}

        {scrapeComplete && scrapedImageUrls.length > 0 && (
          <button style={styles.addButton} onClick={handleDownloadAll}>
            Download All
          </button>
        )}
      </main>
    </div>
  );
}

const styles = {
  body: {
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#FFFFFF",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    color: "#333",
    overflowY: "scroll",
  },
  headerContainer: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 50px",
    boxSizing: "border-box",
    maxWidth: "1200px",
  },
  logo: {
    fontFamily: "Arial, sans-serif",
    fontSize: "28px",
    fontWeight: "bold",
    color: "#007bff",
  },
  buttonWrapper: {
    position: "relative",
    display: "inline-block",
  },
  addButton: {
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "25px",
    padding: "10px 20px",
    fontSize: "16px",
    cursor: "pointer",
    fontWeight: "bold",
    boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
    transition: "background-color 0.2s ease",
    marginTop: "20px",
  },
  comingSoonPopup: {
    position: "absolute",
    top: "calc(100% + 10px)",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#333",
    color: "white",
    padding: "8px 15px",
    borderRadius: "5px",
    fontSize: "0.9em",
    whiteSpace: "nowrap",
    zIndex: 1000,
    boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
  },
  mainContent: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    width: "90%",
    maxWidth: "700px",
    textAlign: "center",
    paddingBottom: "50px",
  },
  title: {
    fontSize: "2.7em",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  onlyfansLogo: {
    display: "inline-flex",
    alignItems: "center",
    color: "#007bff",
    fontWeight: "bold",
    fontSize: "1.1em",
  },
  lockIcon: {
    marginRight: "4px",
    fontSize: "0.75em",
    color: "#007bff",
  },
  fansText: {
    fontFamily: "cursive",
    fontWeight: "bold",
    color: "#007bff",
    fontSize: "0.85em",
  },
  subtitle: {
    fontSize: "1.1em",
    color: "#666",
    marginBottom: "35px",
  },
  searchBarContainer: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    maxWidth: "500px",
    backgroundColor: "#FFFFFF",
    border: "1px solid #ddd",
    borderRadius: "30px",
    padding: "8px 18px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  searchIcon: {
    fontSize: "18px",
    color: "#999",
    marginRight: "8px",
  },
  searchInput: {
    flexGrow: 1,
    border: "none",
    outline: "none",
    fontSize: "15px",
    padding: "4px 0",
    backgroundColor: "transparent",
    color: "#333",
  },
  searchButton: {
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "22px",
    padding: "8px 22px",
    fontSize: "15px",
    cursor: "pointer",
    fontWeight: "bold",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
    transition: "background-color 0.2s ease",
  },
  searchButtonDisabled: {
    backgroundColor: "#a0a0a0",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  statusContainer: {
    marginTop: "25px",
    width: "100%",
    maxWidth: "500px",
    backgroundColor: "#f9f9f9",
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "12px 18px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: "86px",
  },
  statusMessage: {
    fontSize: "1.0em",
    color: "#444",
    fontWeight: "600",
    minHeight: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  countdownDisplay: {
    fontSize: "0.9em",
    color: "#555",
    minHeight: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  countdownTimeText: {
    fontSize: "1.2em",
    fontWeight: "bold",
    color: "#007bff",
    marginLeft: "4px",
  },
  progressBarContainer: {
    width: "100%",
    backgroundColor: "#e0e0e0",
    borderRadius: "5px",
    height: "10px",
    overflow: "hidden",
    marginTop: "10px",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#007bff",
    borderRadius: "5px",
    transition: "width 0.5s ease-in-out",
  },
};

export default App;
