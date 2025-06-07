# OnlyPropellers Website

This document provides an overview of the OnlyPropellers website, detailing its purpose, the technologies used, and instructions for setting up and understanding its functionality.

## 1. Purpose

The OnlyPropellers website is designed to [**_Insert Website Purpose Here_** - e.g., scrape data from various sources, display information, provide a service]. It consists of a backend for data processing and a frontend for user interaction.

## 2. Technologies Used

### Backend (my-scraper-website)
- **Node.js**: The runtime environment for the backend application.
- **Express.js**: A web application framework for Node.js, used for building APIs.
- **Puppeteer**: A Node library which provides a high-level API to control Chrome or Chromium over the DevTools Protocol. Used for web scraping.
- **Cloudinary**: (If applicable) For cloud-based image and video management.
- **Other dependencies**: Check `backend/package.json` for a complete list.

### Frontend (my-scraper-frontend)
- **React**: A JavaScript library for building user interfaces.
- **Vite**: A fast build tool that provides a lightning-fast development experience.
- **CSS**: For styling the user interface.
- **Other dependencies**: Check `my-scraper-frontend/package.json` for a complete list.

## 3. Project Structure

The project is organized into two main directories:
- `my-scraper-website/`: Contains the backend Node.js application.
- `my-scraper-frontend/`: Contains the frontend React application.

For a detailed directory tree, refer to `project-structure.txt`.

## 4. Setup Instructions

To get the project up and running on your local machine, follow these steps:

### 4.1. Prerequisites
- Node.js (LTS version recommended)
- npm (Node Package Manager)

### 4.2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd my-scraper-website
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables (if any, e.g., Cloudinary API keys, database connection strings). You might need a `.env` file or similar configuration.
4. Start the backend server:
   ```bash
   node index.js
   # or npm start, if defined in package.json
   ```
   The backend server typically runs on `http://localhost:3000` (or as configured).

### 4.3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd my-scraper-frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```
   The frontend application typically runs on `http://localhost:5173` (or as configured by Vite).

## 5. How it Works

### Backend (`my-scraper-website`)
- `index.js`: The main entry point of the backend application, setting up the Express server and defining API routes.
- `scraper.js`: Contains the core logic for web scraping using Puppeteer. It defines how data is extracted from target websites.
- `master.js`: (If applicable) Might orchestrate scraping tasks, manage concurrency, or handle data processing after scraping.
- `cli-runner.js`: (If applicable) A command-line interface runner for specific backend tasks.
- `cloudinaryConfig.js`: (If applicable) Configuration for Cloudinary integration.
- `config/config.js`: General configuration settings for the backend.
- `data/`: Directory for storing scraped data or other temporary files.

### Frontend (`my-scraper-frontend`)
- `src/main.jsx`: The entry point for the React application, rendering the main `App` component.
- `src/App.jsx`: The main application component, defining the layout and routing (if any).
- `src/assets/`: Contains static assets like images.
- `src/index.css` and `src/App.css`: Global and component-specific styles.

## 6. Key Functionality

[**_Insert Key Functionality Here_** - e.g., User authentication, data display, search functionality, data export, etc.]

## 7. Contributing

[**_Insert Contribution Guidelines Here_** - e.g., How to report bugs, suggest features, or contribute code.]

## 8. Contact

For any questions or issues, please contact [**_Insert Contact Information Here_**].