import 'server-only'

import { cancelBooking, releaseBookingRoom, type BookingDetail } from '@/db/bookings'
import { announceCancellation } from './booking-emails'
import { livekitRoomName, meetingsConfigured, roomService } from './livekit'
import { stopMeetingRecording } from './meeting-recording'

/**
 * Cancel a booking, close its private room (the link stops working) and tell
 * both sides. Null if it wasn't confirmed any more.
 */
export async function cancelAndNotify(
  bookingId: string,
  by: 'guest' | 'host',
  reason: string | null,
): Promise<BookingDetail | null> {
  const b = await cancelBooking(bookingId, by, reason)
  if (!b) return null
  if (b.meetingRoomId) {
    if (meetingsConfigured()) {
      // Finish any recording so it still lands in the workspace, then end the call.
      await stopMeetingRecording(b.meetingRoomId).catch(() => undefined)
      await roomService()
        .deleteRoom(livekitRoomName(b.meetingRoomId))
        .catch(() => undefined) // no live call
    }
    await releaseBookingRoom(b.meetingRoomId)
  }
  await announceCancellation(b)
  return b
}
