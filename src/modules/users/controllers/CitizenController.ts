import { Request, Response } from 'express';
import { searchCitizensQuerySchema } from '../dtos/user.dto';
import { SearchCitizensService } from '../services/SearchCitizensService';

export class CitizenController {
  async index(req: Request, res: Response): Promise<Response> {
    const query = searchCitizensQuerySchema.parse(req.query);

    const searchCitizensService = new SearchCitizensService();
    const citizens = await searchCitizensService.execute(query);

    return res.status(200).json({
      status: 'success',
      data: citizens,
    });
  }
}
