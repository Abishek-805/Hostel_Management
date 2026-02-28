import { NextFunction, Request, Response } from 'express';

export type AppRole = 'student' | 'admin' | 'gatekeeper';

interface RoleUser {
  id: string;
  role: AppRole;
  hostelBlock: string;
}

interface RoleRequest extends Request {
  user?: RoleUser;
}

export function requireRoles(
  roles: AppRole[],
  options: { allowAdminOverride?: boolean } = { allowAdminOverride: true }
) {
  return (req: RoleRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentRole = req.user.role;
    if (options.allowAdminOverride !== false && currentRole === 'admin') {
      return next();
    }

    if (!roles.includes(currentRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role permission' });
    }

    return next();
  };
}
