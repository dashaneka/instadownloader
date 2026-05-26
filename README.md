# InstaSave ✦ Premium Instagram Downloader

InstaSave is a fast, functional, and premium-designed Instagram Downloader web utility. It runs as a local Express server on your machine, leveraging your residential IP and local web browser sessions (Brave, Chrome, Firefox) to easily download public posts, reels, carousels, and even private posts from accounts you follow.

![InstaSave Preview](preview.png)

---

## ⚡ Key Features

*   🎥 **HD Quality Downloads**: Extracts and saves high-resolution images, videos, and multi-slide carousels.
*   🔒 **Private Post Downloader**: Seamlessly accesses your logged-in browser sessions (Brave/Chrome/Firefox) to authenticate requests and download private posts from accounts you follow.
*   🔄 **Smart Multi-Provider Fetching**:
    1.  Queries a fast, lightweight scraper.
    2.  Automatically falls back to local `yt-dlp` metadata extraction if needed.
*   🌐 **Byte-Streaming Download Proxy**: Streams files directly through your local backend to bypass Instagram CDN access restrictions, headers, and CORS issues.
*   ✨ **Premium UI**: Sleek dark-mode interface with glowing gradients, clean loading indicators, and glassmorphism elements.

---

## 🚀 Quick Start

### 1. Requirements
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18 or newer)
*   [yt-dlp](https://github.com/yt-dlp/yt-dlp) (installed globally)
*   Python `secretstorage` package (to allow `yt-dlp` to read browser cookie keyrings on Linux):
    ```bash
    python3 -m pip install secretstorage --user
    ```

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/dashaneka/instadownloader.git
cd instadownloader
npm install
```

### 3. Run the Server
Start the local Node.js Express server:
```bash
npm start
```
Once started, open your web browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📱 How to Use on Your Phone (Local Tunnel)

Since Instagram blocks cloud hosting environments (like Vercel) from fetching media, the best way to use this downloader on your mobile device is by exposing your local running server to the internet using a secure tunnel:

1.  Make sure your local server is running: `npm start`
2.  In a new terminal window, execute:
    ```bash
    npx localtunnel --port 3000
    ```
3.  Localtunnel will output a public URL (e.g., `https://gentle-frogs-jump.localtunnel.me`).
4.  Open that link on your phone to download posts directly from your couch!

---

## 🔑 Downloading Private Posts
1.  In the dropdown under the input field, select the web browser you are logged into Instagram with (e.g., Brave or Chrome).
2.  **Ensure that selected browser is CLOSED** on your computer before clicking Download. (Chromium browsers lock their cookie databases when open, preventing the server from reading them).
3.  Paste the private post URL and click **Download**.

---

## 📜 License
MIT License. Free to use, modify, and share.
