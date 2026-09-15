/**
 * X (Twitter) adapter interface + stub logging.
 */

import type { PlatformSender } from "../../core/fanout.js";

export interface XAdapter extends PlatformSender {
  postPublicSignal?(text: string): Promise<void>;
}

export class StubXAdapter implements XAdapter {
  readonly logs: string[] = [];

  async send(platformUserId: string, text: string): Promise<void> {
    this.logs.push(`x:dm:${platformUserId} => ${text}`);
    console.log(`[x-stub] DM to ${platformUserId}: ${text.slice(0, 120)}`);
  }

  async postPublicSignal(text: string): Promise<void> {
    this.logs.push(`x:public => ${text}`);
    console.log(`[x-stub] public post: ${text.slice(0, 120)}`);
  }
}
