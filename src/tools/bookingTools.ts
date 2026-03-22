import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { initiateBookingCall } from "../services/bookingService";

// ─── make_booking: Initiate a phone call to make a restaurant booking ─────────

export const makeBookingDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "make_booking",
    description: "Call a restaurant to make a booking. Use when someone wants to book/reserve a table at a venue. The bot will call the restaurant and handle the conversation.",
    parameters: {
      type: "object",
      properties: {
        groupId: {
          type: "string",
          description: "The group chat ID",
        },
        venueName: {
          type: "string",
          description: "Name of the restaurant/venue to book",
        },
        phoneNumber: {
          type: "string",
          description: "Phone number to call (E.164 format, e.g. +447123456789). If not provided, will look up from venue database.",
        },
        partySize: {
          type: "number",
          description: "Number of people for the booking",
        },
        date: {
          type: "string",
          description: "Date for the booking (YYYY-MM-DD format)",
        },
        time: {
          type: "string",
          description: "Time for the booking (24h format, e.g. 19:00)",
        },
        specialRequests: {
          type: "string",
          description: "Any special requests (e.g. dietary requirements, window seat)",
        },
      },
      required: ["groupId", "venueName", "partySize", "date", "time"],
    },
  },
};

export async function makeBooking(args: {
  groupId: string;
  venueName: string;
  phoneNumber?: string;
  partySize: number;
  date: string;
  time: string;
  specialRequests?: string;
}): Promise<string> {
  try {
    console.log(`📞 Initiating booking call for ${args.venueName}...`);

    // If no phone number provided, look up from database
    let phoneNumber = args.phoneNumber;
    if (!phoneNumber) {
      return JSON.stringify({
        needs_phone_number: true,
        message: `What's the phone number for ${args.venueName}? I'll call them straight away once I have it 📞`,
      });
    }

    // Initiate the booking call
    const result = await initiateBookingCall({
      groupId: args.groupId,
      venueName: args.venueName,
      phoneNumber,
      partySize: args.partySize,
      date: args.date,
      time: args.time,
      specialRequests: args.specialRequests,
    });

    return JSON.stringify({
      success: true,
      message: `Calling ${args.venueName} to book for ${args.partySize} people on ${args.date} at ${args.time}...`,
      callSid: result.callSid,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`makeBooking error: ${msg}`);
    return JSON.stringify({ error: `Failed to initiate booking call: ${msg}` });
  }
}
