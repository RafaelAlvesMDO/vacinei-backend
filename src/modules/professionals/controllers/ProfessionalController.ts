import { Request, Response } from 'express';
import {
  listProfessionalsQuerySchema,
  professionalIdParamsSchema,
  rejectProfessionalSchema,
} from '../dtos/professional.dto';
import { ListProfessionalsService } from '../services/ListProfessionalsService';
import { VerifyProfessionalService } from '../services/VerifyProfessionalService';
import { RejectProfessionalService } from '../services/RejectProfessionalService';

export class ProfessionalController {
  async index(req: Request, res: Response): Promise<Response> {
    const query = listProfessionalsQuerySchema.parse(req.query);

    const listProfessionalsService = new ListProfessionalsService();
    const professionals = await listProfessionalsService.execute(query);

    return res.status(200).json({
      status: 'success',
      data: professionals,
    });
  }

  async verify(req: Request, res: Response): Promise<Response> {
    const { id } = professionalIdParamsSchema.parse(req.params);

    const verifyProfessionalService = new VerifyProfessionalService();
    const professional = await verifyProfessionalService.execute(id, req.user.id);

    return res.status(200).json({
      status: 'success',
      data: professional,
    });
  }

  async reject(req: Request, res: Response): Promise<Response> {
    const { id } = professionalIdParamsSchema.parse(req.params);
    const validatedData = rejectProfessionalSchema.parse(req.body ?? {});

    const rejectProfessionalService = new RejectProfessionalService();
    const professional = await rejectProfessionalService.execute(id, req.user.id, validatedData);

    return res.status(200).json({
      status: 'success',
      data: professional,
    });
  }
}
