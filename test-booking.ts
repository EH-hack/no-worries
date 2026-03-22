import { makeBooking } from "./src/tools/bookingTools";

async function testBooking() {
  console.log("🧪 Testing booking call...\n");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format

  try {
    const result = await makeBooking({
      groupId: "test-group-123",
      venueName: "test",
      partySize: 4,
      date: dateStr,
      time: "19:00",
      specialRequests: "Window seat if possible"
    });

    console.log("✅ Result:", result);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testBooking();
