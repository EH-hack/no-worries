import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { createBillDef, addItemsDef, setTaxAndTipDef, splitBillDef } from "./billTools";
import { createBill, addItems, setTaxAndTip, splitBillFn } from "./billTools";
import { getBalancesDef, recordPaymentDef, getGroupSummaryDef } from "./balanceTools";
import { getBalances, recordPayment, getGroupSummary } from "./balanceTools";
import { parseReceiptDef, parseReceipt, requestReceiptUploadDef, requestReceiptUpload } from "./receiptTools";
import { findPlacesDef, findPlaces } from "./placeTools";
import { getWeatherDef, getWeather } from "./weatherTools";
import { showMapDef, showMap } from "./mapTools";
import {
  setLocationDef, setLocation,
  findMeetingSpotDef, findMeetingSpot,
  getLocationsDef, getLocations,
} from "./locationTools";
import {
  registerUserDef, registerUser,
  lookupUserDef, lookupUser,
  listUsersDef, listUsers,
} from "./userTools";
import {
  sendCryptoDef, sendCrypto,
  checkBalanceDef, checkCryptoBalance,
  fundUserDef, fundUser,
  getWalletAddressDef, getWalletAddress,
} from "./cryptoTools";
import {
  requestAudioUploadDef, requestAudioUpload,
} from "./voiceNoteTools";
import { getTflRouteDef, getTflRoute } from "./tflTools";

export const toolDefinitions: ChatCompletionTool[] = [
  createBillDef,
  addItemsDef,
  setTaxAndTipDef,
  splitBillDef,
  getBalancesDef,
  recordPaymentDef,
  getGroupSummaryDef,
  requestReceiptUploadDef,
  parseReceiptDef,
  findPlacesDef,
  getWeatherDef,
  setLocationDef,
  findMeetingSpotDef,
  getLocationsDef,
  sendCryptoDef,
  checkBalanceDef,
  fundUserDef,
  getWalletAddressDef,
  registerUserDef,
  lookupUserDef,
  listUsersDef,
  requestAudioUploadDef,
  getTflRouteDef,
  showMapDef,
];

export async function executeTool(name: string, args: string, groupId?: string): Promise<string> {
  const parsed = JSON.parse(args);
  // Override groupId with the verified value from the poll loop
  if (groupId) parsed.groupId = groupId;
  switch (name) {
    case "create_bill":
      return createBill(parsed);
    case "add_items":
      return addItems(parsed);
    case "set_tax_and_tip":
      return setTaxAndTip(parsed);
    case "split_bill":
      return splitBillFn(parsed);
    case "get_balances":
      return getBalances(parsed);
    case "record_payment":
      return recordPayment(parsed);
    case "get_group_summary":
      return getGroupSummary(parsed);
    case "parse_receipt":
      return parseReceipt(parsed);
    case "request_receipt_upload":
      return requestReceiptUpload(parsed);
    case "find_places":
      return findPlaces(parsed);
        case "get_weather":
      return getWeather(parsed);
    case "set_location":
      return setLocation(parsed);
    case "find_meeting_spot":
      return findMeetingSpot(parsed);
    case "get_locations":
      return getLocations(parsed);
    case "send_crypto":
      return sendCrypto(parsed);
    case "check_crypto_balance":
      return checkCryptoBalance(parsed);
    case "fund_user":
      return fundUser(parsed);
    case "get_wallet_address":
      return getWalletAddress(parsed);
    case "register_user":
      return registerUser(parsed);
    case "lookup_user":
      return lookupUser(parsed);
    case "list_users":
      return listUsers(parsed);
    case "request_audio_upload":
      return requestAudioUpload(parsed);
    case "get_tfl_route":
      return getTflRoute(parsed);
    case "show_map":
      return showMap(parsed);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
