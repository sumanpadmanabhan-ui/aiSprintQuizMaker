import { deleteMcq, getMcqById, McqNotFoundError, updateMcq } from "@/lib/services/mcq-service";
import {
	mcqErrorResponse,
	parseMcqBody,
	readJsonBody,
	readRouteId,
	type McqRouteContext,
} from "@/app/api/mcqs/validation";

export async function GET(_request: Request, context: McqRouteContext): Promise<Response> {
	try {
		const mcq = await getMcqById(await readRouteId(context));
		if (!mcq) {
			throw new McqNotFoundError();
		}
		return Response.json(mcq);
	} catch (error) {
		return mcqErrorResponse(error);
	}
}

export async function PUT(request: Request, context: McqRouteContext): Promise<Response> {
	try {
		const id = await readRouteId(context);
		const body = parseMcqBody(await readJsonBody(request));
		const mcq = await updateMcq({ ...body, id });
		return Response.json(mcq);
	} catch (error) {
		return mcqErrorResponse(error);
	}
}

export async function DELETE(_request: Request, context: McqRouteContext): Promise<Response> {
	try {
		await deleteMcq(await readRouteId(context));
		return new Response(null, { status: 204 });
	} catch (error) {
		return mcqErrorResponse(error);
	}
}
