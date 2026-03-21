import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, PUBLIC_URL } from "../config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingRequest {
  groupId: string;
  venueName: string;
  phoneNumber: string;
  partySize: number;
  date: string;
  time: string;
  specialRequests?: string;
}

export interface BookingCallResult {
  callSid: string;
  status: string;
}

// ─── Initiate booking call ────────────────────────────────────────────────────

export async function initiateBookingCall(
  request: BookingRequest
): Promise<BookingCallResult> {
  console.log(`[BOOKING] Initiating call to ${request.phoneNumber} for ${request.venueName}`);

  // TODO: Replace with real Twilio SDK integration
  // For now, return placeholder response

  // PLACEHOLDER: When implementing, use Twilio SDK like this:
  // import twilio from 'twilio';
  // const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  //
  // const call = await client.calls.create({
  //   url: `${PUBLIC_URL}/booking/twiml`,
  //   to: request.phoneNumber,
  //   from: TWILIO_PHONE_NUMBER,
  //   statusCallback: `${PUBLIC_URL}/booking/status`,
  //   statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  // });

  const placeholderCallSid = `CA${Math.random().toString(36).substr(2, 32)}`;

  console.log(`[BOOKING] Placeholder call created with SID: ${placeholderCallSid}`);
  console.log(`[BOOKING] Details:`, {
    venue: request.venueName,
    phone: request.phoneNumber,
    party: request.partySize,
    date: request.date,
    time: request.time,
    special: request.specialRequests,
  });

  return {
    callSid: placeholderCallSid,
    status: "initiated",
  };
}

// ─── Generate TwiML for call flow ─────────────────────────────────────────────

export function generateBookingTwiML(request: BookingRequest): string {
  // PLACEHOLDER: This would generate the initial TwiML to start the Media Stream
  // and connect to our WebSocket endpoint

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting to booking assistant</Say>
  <Connect>
    <Stream url="wss://${PUBLIC_URL.replace('https://', '')}/booking/media" />
  </Connect>
</Response>`;
}

// ─── Booking conversation context ─────────────────────────────────────────────

export interface BookingContext {
  groupId: string;
  venueName: string;
  partySize: number;
  date: string;
  time: string;
  specialRequests?: string;
  conversationState: "greeting" | "confirming" | "waiting_for_staff" | "booking" | "completed" | "failed";
  transcript: string[];
}

// In-memory storage for active booking calls
const activeBookings = new Map<string, BookingContext>();

export function createBookingContext(callSid: string, request: BookingRequest): void {
  activeBookings.set(callSid, {
    groupId: request.groupId,
    venueName: request.venueName,
    partySize: request.partySize,
    date: request.date,
    time: request.time,
    specialRequests: request.specialRequests,
    conversationState: "greeting",
    transcript: [],
  });
}

export function getBookingContext(callSid: string): BookingContext | undefined {
  return activeBookings.get(callSid);
}

export function updateBookingContext(callSid: string, updates: Partial<BookingContext>): void {
  const context = activeBookings.get(callSid);
  if (context) {
    Object.assign(context, updates);
  }
}

export function clearBookingContext(callSid: string): void {
  activeBookings.delete(callSid);
}

// ─── Booking agent prompt ─────────────────────────────────────────────────────

export function getBookingAgentPrompt(context: BookingContext): string {
  return `You are a polite, professional restaurant booking assistant making a phone call on behalf of a customer.

BOOKING DETAILS:
- Restaurant: ${context.venueName}
- Party size: ${context.partySize} people
- Date: ${context.date}
- Time: ${context.time}
${context.specialRequests ? `- Special requests: ${context.specialRequests}` : ""}

YOUR TASK:
1. Greet the restaurant staff professionally
2. Request a table booking for the specified date, time, and party size
3. Mention any special requests if applicable
4. Confirm the booking details they provide
5. Thank them and end the call

IMPORTANT RULES:
- Be concise and natural - this is a real phone call
- Listen carefully to their responses
- If they can't accommodate the request, ask for alternative times
- If they need a callback number, provide the customer's contact
- Stay in character as a customer's assistant
- Keep responses under 2-3 sentences at a time

Current conversation state: ${context.conversationState}

Respond naturally to continue the booking conversation.`;
}
