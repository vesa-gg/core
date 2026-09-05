import { Scrim } from "../models/Scrims";

export interface AlertSink {
  warn(message: string): Promise<void>;
  error(message: string): Promise<void>;
}

export interface ScrimNotifier {
  updateSignupPostDescription(scrim: Scrim, signupCount: number): Promise<void>;
  sendScoresComputedMessage(
    date: Date,
    lobbies: { name: string; link: string }[],
  ): Promise<void>;
}
