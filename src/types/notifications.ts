import { Scrim } from "../models/Scrims";

/**
 * Operational error/warning sink. scrim-bot's concrete `AlertService` posts
 * these to a Discord channel; a future non-Discord caller could log to
 * anything else. Services depend on this interface, never on a concrete
 * Discord-coupled implementation, so this package never needs discord.js.
 */
export interface AlertSink {
  warn(message: string): Promise<void>;
  error(message: string): Promise<void>;
}

/**
 * Outbound "tell the world about this scrim" notifications. scrim-bot's
 * concrete `DiscordService` implements this against a live discord.js
 * `Client`. Kept as an interface here for the same reason as `AlertSink`.
 */
export interface ScrimNotifier {
  updateSignupPostDescription(
    scrim: Scrim,
    signupCount: number,
  ): Promise<void>;
  sendScoresComputedMessage(
    date: Date,
    lobbies: { name: string; link: string }[],
  ): Promise<void>;
}
