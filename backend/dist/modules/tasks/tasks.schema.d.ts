import { z } from 'zod';
export declare const createTaskSchema: z.ZodObject<{
    campaign_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    beneficiary_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    source_type: z.ZodEnum<["BENEFICIARY_REQUEST", "NGO_CAMPAIGN", "PLATFORM_CAMPAIGN", "ADMIN_CREATED"]>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    family_size: z.ZodDefault<z.ZodNumber>;
    items_needed: z.ZodDefault<z.ZodArray<z.ZodAny, "many">>;
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
    location_text: z.ZodOptional<z.ZodString>;
    radius_km: z.ZodDefault<z.ZodNumber>;
    budget_pkr: z.ZodDefault<z.ZodNumber>;
    urgency: z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "CRITICAL"]>>;
}, "strip", z.ZodTypeAny, {
    source_type: "BENEFICIARY_REQUEST" | "NGO_CAMPAIGN" | "PLATFORM_CAMPAIGN" | "ADMIN_CREATED";
    title: string;
    family_size: number;
    items_needed: any[];
    latitude: number;
    longitude: number;
    radius_km: number;
    budget_pkr: number;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description?: string | undefined;
    campaign_id?: number | null | undefined;
    beneficiary_id?: number | null | undefined;
    category?: string | undefined;
    location_text?: string | undefined;
}, {
    source_type: "BENEFICIARY_REQUEST" | "NGO_CAMPAIGN" | "PLATFORM_CAMPAIGN" | "ADMIN_CREATED";
    title: string;
    latitude: number;
    longitude: number;
    description?: string | undefined;
    campaign_id?: number | null | undefined;
    beneficiary_id?: number | null | undefined;
    category?: string | undefined;
    family_size?: number | undefined;
    items_needed?: any[] | undefined;
    location_text?: string | undefined;
    radius_km?: number | undefined;
    budget_pkr?: number | undefined;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
}>;
export declare const updateTaskSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    family_size: z.ZodOptional<z.ZodNumber>;
    items_needed: z.ZodOptional<z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        quantity: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    }, "strip", z.ZodTypeAny, {
        item: string;
        quantity: string | number;
    }, {
        item: string;
        quantity: string | number;
    }>, "many">>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    location_text: z.ZodOptional<z.ZodString>;
    radius_km: z.ZodOptional<z.ZodNumber>;
    budget_pkr: z.ZodOptional<z.ZodNumber>;
    urgency: z.ZodOptional<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "CRITICAL"]>>;
    status: z.ZodOptional<z.ZodString>;
    coordinator_id: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status?: string | undefined;
    description?: string | undefined;
    title?: string | undefined;
    category?: string | undefined;
    family_size?: number | undefined;
    items_needed?: {
        item: string;
        quantity: string | number;
    }[] | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    location_text?: string | undefined;
    radius_km?: number | undefined;
    budget_pkr?: number | undefined;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    coordinator_id?: number | undefined;
}, {
    status?: string | undefined;
    description?: string | undefined;
    title?: string | undefined;
    category?: string | undefined;
    family_size?: number | undefined;
    items_needed?: {
        item: string;
        quantity: string | number;
    }[] | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    location_text?: string | undefined;
    radius_km?: number | undefined;
    budget_pkr?: number | undefined;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    coordinator_id?: number | undefined;
}>, {
    status?: string | undefined;
    description?: string | undefined;
    title?: string | undefined;
    category?: string | undefined;
    family_size?: number | undefined;
    items_needed?: {
        item: string;
        quantity: string | number;
    }[] | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    location_text?: string | undefined;
    radius_km?: number | undefined;
    budget_pkr?: number | undefined;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    coordinator_id?: number | undefined;
}, {
    status?: string | undefined;
    description?: string | undefined;
    title?: string | undefined;
    category?: string | undefined;
    family_size?: number | undefined;
    items_needed?: {
        item: string;
        quantity: string | number;
    }[] | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    location_text?: string | undefined;
    radius_km?: number | undefined;
    budget_pkr?: number | undefined;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    coordinator_id?: number | undefined;
}>;
export declare const taskIdParam: z.ZodObject<{
    id: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: number;
}, {
    id: number;
}>;
export declare const assignTaskSchema: z.ZodObject<{
    volunteer_id: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    volunteer_id: number;
}, {
    volunteer_id: number;
}>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
//# sourceMappingURL=tasks.schema.d.ts.map