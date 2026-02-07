## 🚀 Deployment Notes

This application is primarily designed to run in a **local development environment**.

### Running in Development Mode

1. Open a terminal.
2. Navigate to the project directory:
   ```bash
   cd <project-directory>
3. Start the development server:
   ```bash
   npm run dev
4. Open a web browser and navigate to:
   ```bash
   http://localhost:5173/live
⚠️ Notes:
The application must be executed from the project directory.
Web Serial API and Web Bluetooth API require access via localhost or a secure (HTTPS) context.
This mode is recommended for development, testing, and research usage.

##  Build for Production
If users want to deploy the application as a static website, follow these steps:
1. Open a terminal and navigate to the project directory.
2. Build the production-ready files:
   ```bash
   npm run build
3. After the build process is completed, a dist/ directory will be generated.
This directory contains optimized static files ready for deployment.

##  Deploy to a Web Server
The contents of the dist/ directory can be deployed to any static web hosting service, such as:
- VPS servers (e.g., Nginx or Apache)
- Static hosting platforms
- Institutional or laboratory web servers
After deployment, the application can be accessed through the deployed URL.


## Live Deployment Example
A deployed version of this system is available at:
🔗 https://pressuresensor.site/live
This deployment demonstrates the finalized interface and functionality of the Pressure Sensor Measurement System in a real-world environment.

## 👤 Author
Juan Anthonio Salas
