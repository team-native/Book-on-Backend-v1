import { app } from "./app";
import { env } from "./config/env";
import { startNotificationScheduler } from "./services/notification-scheduler";

app.listen(env.port, () => {
  console.log(`Server is running on port ${env.port}`);
  startNotificationScheduler();
});
