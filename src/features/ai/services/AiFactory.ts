import { IAiService } from "@core/services/ai/IAiService";
import { GeminiService } from "./GeminiService";
import { AiConfig } from "@/types";

export class AiFactory {
    private static instance: IAiService | null = null;
    private static currentConfig: AiConfig | null = null;

    /**
     * Returns the configured AI Service strategy.
     * Creates service based on the provided AI configuration.
     */
    static getService(config: AiConfig): IAiService {
        // If config changed or no instance exists, create new service
        // Only overwrite instance if config explicitly changed AND we have a previous config to compare against.
        // If instance was set manually (via setService) and currentConfig is still null, we keep the instance.
        if (!this.instance || (this.currentConfig && JSON.stringify(this.currentConfig) !== JSON.stringify(config))) {
            this.currentConfig = config;

            switch (config.provider) {
                case 'google-gemini':
                    this.instance = new GeminiService(config.apiKey, config.model);
                    break;
                // Add other providers here in the future
                default:
                    this.instance = new GeminiService(config.apiKey, config.model);
            }
        }
        return this.instance;
    }

    /**
     * For testing: Reset the singleton or inject a mock.
     */
    static setService(service: IAiService) {
        this.instance = service;
    }

    /**
     * Clear the current instance (useful for testing)
     */
    static clearInstance() {
        this.instance = null;
        this.currentConfig = null;
    }
}
