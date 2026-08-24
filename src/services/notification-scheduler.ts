import { env } from "../config/env";
import { sendDueLoanReminders, sendPendingNoticeNotifications } from "./notifications";

let dueReminderTimer: NodeJS.Timeout | undefined;
let noticeTimer: NodeJS.Timeout | undefined;
let dueReminderRunning = false;
let noticeRunning = false;

const nextDueReminderDelay = () => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(env.fcm.dueReminderHour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
};

const runDueReminders = async () => {
  if (dueReminderRunning) {
    return;
  }
  dueReminderRunning = true;
  try {
    await sendDueLoanReminders(3);
    await sendDueLoanReminders(0);
  } catch (error) {
    console.error("Failed to send due loan reminders.", error);
  } finally {
    dueReminderRunning = false;
  }
};

const scheduleNextDueReminder = () => {
  dueReminderTimer = setTimeout(async () => {
    await runDueReminders();
    scheduleNextDueReminder();
  }, nextDueReminderDelay());
};

const runNoticeNotifications = async () => {
  if (noticeRunning) {
    return;
  }
  noticeRunning = true;
  try {
    await sendPendingNoticeNotifications();
  } catch (error) {
    console.error("Failed to send notice notifications.", error);
  } finally {
    noticeRunning = false;
  }
};

export const startNotificationScheduler = () => {
  if (!env.fcm.schedulerEnabled) {
    return;
  }

  scheduleNextDueReminder();
  noticeTimer = setInterval(runNoticeNotifications, env.fcm.noticePollIntervalMs);
  void runNoticeNotifications();
};

export const stopNotificationScheduler = () => {
  if (dueReminderTimer) clearTimeout(dueReminderTimer);
  if (noticeTimer) clearInterval(noticeTimer);
};
