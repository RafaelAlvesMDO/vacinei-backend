import { Request, Response } from 'express';
import { overdueQuerySchema, recentDosesQuerySchema } from '../dtos/dashboard.dto';
import { GetOverdueListService } from '../services/GetOverdueListService';
import { GetDashboardSummaryService } from '../services/GetDashboardSummaryService';
import { GetRecentDosesService } from '../services/GetRecentDosesService';
import { GetMonthlyVaccinationsService } from '../services/GetMonthlyVaccinationsService';

export class DashboardController {
  async summary(_req: Request, res: Response): Promise<Response> {
    const getDashboardSummaryService = new GetDashboardSummaryService();
    const summary = await getDashboardSummaryService.execute();

    return res.status(200).json({
      status: 'success',
      data: summary,
    });
  }

  async recentDoses(req: Request, res: Response): Promise<Response> {
    const validatedQuery = recentDosesQuerySchema.parse(req.query);

    const getRecentDosesService = new GetRecentDosesService();
    const doses = await getRecentDosesService.execute(validatedQuery);

    return res.status(200).json({
      status: 'success',
      data: doses,
    });
  }

  async overdue(req: Request, res: Response): Promise<Response> {
    const validatedQuery = overdueQuerySchema.parse(req.query);

    const getOverdueListService = new GetOverdueListService();
    const overdue = await getOverdueListService.execute(validatedQuery);

    return res.status(200).json({
      status: 'success',
      data: overdue,
    });
  }

  async monthly(_req: Request, res: Response): Promise<Response> {
    const getMonthlyVaccinationsService = new GetMonthlyVaccinationsService();
    const months = await getMonthlyVaccinationsService.execute();

    return res.status(200).json({
      status: 'success',
      data: months,
    });
  }
}
