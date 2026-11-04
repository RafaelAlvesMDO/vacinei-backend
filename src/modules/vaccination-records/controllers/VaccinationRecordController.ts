import { Request, Response } from 'express';
import {
  citizenIdParamsSchema,
  confirmVaccinationSchema,
  manualVaccinationRecordSchema,
  recordIdParamsSchema,
} from '../dtos/vaccination-record.dto';
import { ConfirmVaccinationService } from '../services/ConfirmVaccinationService';
import { CreateManualVaccinationRecordService } from '../services/CreateManualVaccinationRecordService';
import { DeleteManualVaccinationRecordService } from '../services/DeleteManualVaccinationRecordService';
import { GetCitizenVaccinationCardService } from '../services/GetCitizenVaccinationCardService';
import { UpdateManualVaccinationRecordService } from '../services/UpdateManualVaccinationRecordService';
import { RecognizeVaccinationCardService } from '../services/RecognizeVaccinationCardService';
import { AppError } from '../../../errors/AppError';

export class VaccinationRecordController {
  async create(req: Request, res: Response): Promise<Response> {
    const validatedData = manualVaccinationRecordSchema.parse(req.body);

    const createManualVaccinationRecordService = new CreateManualVaccinationRecordService();
    const result = await createManualVaccinationRecordService.execute(req.user.id, validatedData);

    return res.status(201).json({
      status: 'success',
      data: result,
    });
  }

  async update(req: Request, res: Response): Promise<Response> {
    const { id } = recordIdParamsSchema.parse(req.params);
    const validatedData = manualVaccinationRecordSchema.parse(req.body);

    const updateManualVaccinationRecordService = new UpdateManualVaccinationRecordService();
    const result = await updateManualVaccinationRecordService.execute(req.user.id, id, validatedData);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }

  async delete(req: Request, res: Response): Promise<Response> {
    const { id } = recordIdParamsSchema.parse(req.params);

    const deleteManualVaccinationRecordService = new DeleteManualVaccinationRecordService();
    await deleteManualVaccinationRecordService.execute(req.user.id, id);

    return res.status(204).send();
  }

  // Leitura da caderneta por foto (RF004 / D34): só sugestões, nada é gravado
  async recognize(req: Request, res: Response): Promise<Response> {
    if (!req.file) {
      throw new AppError('Envie a foto da caderneta no campo "image".', 400, 'IMAGEM_AUSENTE');
    }

    const recognizeVaccinationCardService = new RecognizeVaccinationCardService();
    const result = await recognizeVaccinationCardService.execute(req.file.buffer, req.file.mimetype);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }

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
