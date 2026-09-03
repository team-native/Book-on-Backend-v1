import { app } from "./app";
import { env } from "./config/env";
import { runMigrations } from "./db/migrate";
import { startNotificationScheduler } from "./services/notification-scheduler";

runMigrations()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`Server is running on port ${env.port}`);
      startNotificationScheduler();
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
