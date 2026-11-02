import { startReminderLoop } from './lib/booking-reminders'

// Node-only start-up work. Not while building: there's no server to run it.
if (process.env.NEXT_PHASE !== 'phase-production-build') startReminderLoop()
