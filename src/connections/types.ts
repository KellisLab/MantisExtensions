export type setProgressType = (progress: GenerationProgress) => void;
export type onMessageType = (messageType: string, messagePayload: any) => void;
export type registerListenersType = (sendMessage: (command: string, args: any[]) => void) => void;
export type injectUIType = (space_id: string, onMessage: onMessageType, registerListeners: registerListenersType) => Promise<HTMLElement>;
export type establishLogSocketType = (space_id: string) => void;

export type DatabaseErrorDetails = {
    database_error: boolean;
    operation: string;
    batch_size?: number;
    num_ideas?: number;
    stage?: string;
    connection_error?: boolean;
    ssl_error?: boolean;
    ssl_message?: string;
    retry_count?: number;
    last_retry?: string;
};

export type SSLErrorDetails = {
    ssl_error: boolean;
    certificate_details?: {
        issuer?: string;
        valid_from?: string;
        valid_to?: string;
        error_code?: string;
    };
    connection_info?: {
        host?: string;
        port?: number;
        protocol?: string;
    };
};

export type OperationalErrorDetails = {
    operation_error: boolean;
    operation_type?: string;
    affected_records?: number;
    error_code?: string;
    component?: string;
    recovery_suggestion?: string;
};

export type ErrorDetails = {
    exception_type?: string;
    exception_message?: string;
    traceback?: string[];
    error_type?: string;
    error_message?: string;
    full_traceback?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: Record<string, any>;
    database?: DatabaseErrorDetails;
    ssl?: SSLErrorDetails;
    operational?: OperationalErrorDetails;
    timestamp?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    is_recoverable?: boolean;
    retry_status?: {
        attempts: number;
        max_attempts: number;
        next_retry?: string;
    };
};

export type LogMessage = {
    type: 'log' | 'progress' | 'error';
    message: string;
    level?: string;
    logger?: string;
    timestamp?: string;
    error_details?: ErrorDetails;
    task_name?: string;
    task_id?: string;
    space_id?: string;
    metadata?: {
        component?: string;
        operation?: string;
        user_facing?: boolean;
    };
};

// Defines the stages in the generation process
export enum GenerationProgress {
    GATHERING_DATA = "Gathering Data",
    CREATING_SPACE = "Creating Space",
    INJECTING_UI = "Injecting into GUI",
    COMPLETED = "Completed",
    FAILED = "Failed"
}

// Defines the order of the stages in the generation process
// this is used to determine progress percent
export const Progression = [GenerationProgress.GATHERING_DATA, 
                            GenerationProgress.CREATING_SPACE, 
                            GenerationProgress.INJECTING_UI,
                            GenerationProgress.COMPLETED,];

interface CreateSpaceResult {
    spaceId: string; // Id of the space created
    createdWidget: HTMLElement; // The element that was injected to the page (we need to track this so we can manage it's state)
}

export interface MantisConnection {
    name: string; // Name of the connection to display
    description: string; // A brief description of what the connection does
    icon: string; // The icon URL to display for the connection
    trigger: (url: string) => boolean; // A function that returns true if the connection should be used for any given URL
    createSpace: (injectUI: injectUIType, setProgress: setProgressType, onMessage: onMessageType, registerListeners: registerListenersType, establishLogSocketType: establishLogSocketType) => Promise<CreateSpaceResult>; // A function that creates a space and returns the spaceId
    injectUI: injectUIType; // A function that injects the UI into the page
    onMessage?: onMessageType; // A function that handles messages from the injected Mantis
    registerListeners?: registerListenersType; // A function that registers a listeners on the main page that can send messages to the injected Mantis
}

// This is what is stored in chrome local storage
export interface StoredSpace {
    name: string;
    id: string; // ID of the space created
    dateCreated: string;
    url: string;
    host: string;
    connectionParent: string;
}
