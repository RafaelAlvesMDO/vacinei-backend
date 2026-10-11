import { Request, Response } from 'express';
import { citizenIdParamsSchema, confirmVaccinationSchema } from '../dtos/vaccination-record.dto';
import { ConfirmVaccinationService } from '../services/ConfirmVaccinationService';
import { GetCitizenVaccinationCardService } from '../services/GetCitizenVaccinationCardService';

export class VaccinationRecordController {
  async confirm(req: Request, res: Response): Promise<Response> {
    const validatedData = confirmVaccinationSchema.parse(req.body);

    const confirmVaccinationService = new ConfirmVaccinationService();
    const result = await confirmVaccinationService.execute(req.user.id, validatedData);

    return res.status(result.action === 'CREATED' ? 201 : 200).json({
      status: 'success',
      data: result,
    });
  }

  async citizenCard(req: Request, res: Response): Promise<Response> {
    const { id } = citizenIdParamsSchema.parse(req.params);

    const getCitizenVaccinationCardService = new GetCitizenVaccinationCardService();
    const card = await getCitizenVaccinationCardService.execute(id, req.user);

    return res.status(200).json({
      status: 'success',
      data: card,
    });
  }
}
