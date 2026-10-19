import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: process.env.DAYWEAVE_TEST_URL || "http://localhost:3100",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: process.env.DAYWEAVE_TEST_URL
    ? undefined
    : {
        command: "npm run start -- --port 3100",
        url: "http://localhost:3100/login",
        reuseExistingServer: false,
        env: {
          APP_URL: "http://localhost:3100",
          DATABASE_PATH: "/tmp/dayweave-e2e-" + Date.now() + ".sqlite",
          SIGNUP_INVITE_CODE: "local-test-invite",
          OAUTH_REDIRECT_URIS: '["https://client.example/callback"]',
        },
      },
  reporter: "list",
});
