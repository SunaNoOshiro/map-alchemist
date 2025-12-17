import { IAiService } from "../../../core/services/ai/IAiService";
import { GeminiService } from "./GeminiService";

export class AiFactory {
    private static instance: IAiService | null = null;

    /**
     * Returns the configured AI Service strategy.
     * Currently defaults to GeminiService.
     * In the future, this could read config to return OpenAiService, etc.
     */
    static getService(): IAiService {
        if (!this.instance) {
            this.instance = new GeminiService();
        }
        return this.instance;
    }

    /**
     * For testing: Reset the singleton or inject a mock.
     */
    static setService(service: IAiService) {
        this.instance = service;
    }
}
