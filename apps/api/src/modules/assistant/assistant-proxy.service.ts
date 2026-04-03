import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PermissionAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantProxyQueryDto } from './dto/assistant.dto';
import { AssistantAuthzService } from './assistant-authz.service';
import { AssistantEffectiveAccess } from './assistant.types';

@Injectable()
export class AssistantProxyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AssistantAuthzService) private readonly authz: AssistantAuthzService
  ) {}

  async getSalesSnapshot(query: AssistantProxyQueryDto, access: AssistantEffectiveAccess) {
    this.authz.assertModulePermission(access, 'sales', PermissionAction.VIEW);

    const take = this.take(query.limit);
    const orderWhere: Prisma.OrderWhereInput = {};

    if (query.q) {
      const keyword = query.q.trim();
      if (keyword) {
        orderWhere.OR = [
          { orderNo: { contains: keyword, mode: 'insensitive' } },
          { customerName: { contains: keyword, mode: 'insensitive' } }
        ];
      }
    }

    const employeeScope = this.resolveEmployeeScope(access);
    if (!employeeScope.companyWide) {
      if (employeeScope.employeeIds.length === 0) {
        return this.emptySnapshot('sales', access, query);
      }
      orderWhere.employeeId = { in: employeeScope.employeeIds };
    }

    const orders = await this.prisma.client.order.findMany({
      where: orderWhere,
      include: {
        items: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take
    });

    const orderIds = orders.map((item) => item.id);
    const invoices = orderIds.length > 0
      ? await this.prisma.client.invoice.findMany({
          where: {
            orderId: {
              in: orderIds
            }
          },
          orderBy: { createdAt: 'desc' },
          take
        })
      : [];

    return {
      module: 'sales',
      scope: access.scope,
      query,
      snapshot: {
        orders,
        invoices,
        metrics: {
          orderCount: orders.length,
          invoiceCount: invoices.length
        }
      }
    };
  }

  async getCustomerCareSnapshot(query: AssistantProxyQueryDto, access: AssistantEffectiveAccess) {
    this.authz.assertModulePermission(access, 'crm', PermissionAction.VIEW);

    const take = this.take(query.limit);
    const where: Prisma.CustomerWhereInput = {};

    if (query.q) {
      const keyword = query.q.trim();
      if (keyword) {
        where.OR = [
          { fullName: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword, mode: 'insensitive' } },
          { email: { contains: keyword, mode: 'insensitive' } }
        ];
      }
    }

    const actorScope = this.resolveActorScope(access);
    if (!actorScope.companyWide) {
      if (actorScope.actorIds.length === 0) {
        return this.emptySnapshot('cskh', access, query);
      }
      where.ownerStaffId = {
        in: actorScope.actorIds
      };
    }

    const customers = await this.prisma.client.customer.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take
    });

    const customerIds = customers.map((item) => item.id);

    const interactions = customerIds.length > 0
      ? await this.prisma.client.customerInteraction.findMany({
          where: {
            customerId: {
              in: customerIds
            }
          },
          orderBy: { interactionAt: 'desc' },
          take: take * 2
        })
      : [];

    const threads = customerIds.length > 0
      ? await this.prisma.client.conversationThread.findMany({
          where: {
            customerId: {
              in: customerIds
            }
          },
          orderBy: { updatedAt: 'desc' },
          take
        })
      : [];

    return {
      module: 'cskh',
      scope: access.scope,
      query,
      snapshot: {
        customers,
        interactions,
        threads,
        metrics: {
          customerCount: customers.length,
          interactionCount: interactions.length,
          threadCount: threads.length
        }
      }
    };
  }

  async getHrSnapshot(query: AssistantProxyQueryDto, access: AssistantEffectiveAccess) {
    this.authz.assertModulePermission(access, 'hr', PermissionAction.VIEW);

    const take = this.take(query.limit);
    const employeeWhere: Prisma.EmployeeWhereInput = {};

    if (query.q) {
      const keyword = query.q.trim();
      if (keyword) {
        employeeWhere.OR = [
          { fullName: { contains: keyword, mode: 'insensitive' } },
          { email: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword, mode: 'insensitive' } },
          { code: { contains: keyword, mode: 'insensitive' } }
        ];
      }
    }

    const scope = this.resolveEmployeeScope(access);
    if (!scope.companyWide) {
      if (access.scope.type === 'self') {
        if (scope.employeeIds.length === 0) {
          return this.emptySnapshot('hr', access, query);
        }
        employeeWhere.id = { in: scope.employeeIds };
      } else if (scope.orgUnitIds.length > 0) {
        employeeWhere.orgUnitId = { in: scope.orgUnitIds };
      } else if (scope.employeeIds.length > 0) {
        employeeWhere.id = { in: scope.employeeIds };
      } else {
        return this.emptySnapshot('hr', access, query);
      }
    }

    const employees = await this.prisma.client.employee.findMany({
      where: employeeWhere,
      orderBy: { updatedAt: 'desc' },
      take
    });

    const employeeIds = employees.map((item) => item.id);

    const [payrolls, leaveRequests] = await Promise.all([
      employeeIds.length > 0
        ? this.prisma.client.payroll.findMany({
            where: {
              employeeId: {
                in: employeeIds
              }
            },
            orderBy: [{ payYear: 'desc' }, { payMonth: 'desc' }],
            take
          })
        : Promise.resolve([]),
      employeeIds.length > 0
        ? this.prisma.client.leaveRequest.findMany({
            where: {
              employeeId: {
                in: employeeIds
              }
            },
            orderBy: { createdAt: 'desc' },
            take
          })
        : Promise.resolve([])
    ]);

    return {
      module: 'hr',
      scope: access.scope,
      query,
      snapshot: {
        employees,
        payrolls,
        leaveRequests,
        metrics: {
          employeeCount: employees.length,
          payrollCount: payrolls.length,
          leaveCount: leaveRequests.length
        }
      }
    };
  }

  async getWorkflowSnapshot(query: AssistantProxyQueryDto, access: AssistantEffectiveAccess) {
    this.authz.assertModulePermission(access, 'workflows', PermissionAction.VIEW);

    const take = this.take(query.limit);
    const scope = this.resolveActorScope(access);

    const approvalWhere: Prisma.ApprovalWhereInput = {
      ...(query.q
        ? {
            OR: [
              { targetType: { contains: query.q, mode: 'insensitive' } },
              { targetId: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    if (!scope.companyWide) {
      if (scope.actorIds.length === 0) {
        return this.emptySnapshot('workflow', access, query);
      }
      approvalWhere.OR = [
        ...(Array.isArray(approvalWhere.OR) ? approvalWhere.OR : []),
        { requesterId: { in: scope.actorIds } },
        { approverId: { in: scope.actorIds } },
        { decisionActorId: { in: scope.actorIds } }
      ];
    }

    const approvals = await this.prisma.client.approval.findMany({
      where: approvalWhere,
      orderBy: { createdAt: 'desc' },
      take
    });

    const instanceIds = Array.from(new Set(approvals.map((item) => item.instanceId).filter(Boolean))) as string[];

    const instances = instanceIds.length > 0
      ? await this.prisma.client.workflowInstance.findMany({
          where: {
            id: {
              in: instanceIds
            }
          },
          include: {
            definition: true
          },
          orderBy: { updatedAt: 'desc' },
          take
        })
      : [];

    return {
      module: 'workflow',
      scope: access.scope,
      query,
      snapshot: {
        approvals,
        instances,
        metrics: {
          approvalCount: approvals.length,
          instanceCount: instances.length
        }
      }
    };
  }

  async getFinanceSnapshot(query: AssistantProxyQueryDto, access: AssistantEffectiveAccess) {
    this.authz.assertModulePermission(access, 'finance', PermissionAction.VIEW);

    const take = this.take(query.limit);
    const scope = this.resolveEmployeeScope(access);

    const invoiceWhere: Prisma.InvoiceWhereInput = {};
    if (query.q) {
      const keyword = query.q.trim();
      if (keyword) {
        invoiceWhere.OR = [
          { invoiceNo: { contains: keyword, mode: 'insensitive' } },
          { partnerName: { contains: keyword, mode: 'insensitive' } },
          { order: { is: { customerName: { contains: keyword, mode: 'insensitive' } } } }
        ];
      }
    }

    if (!scope.companyWide) {
      if (scope.employeeIds.length === 0) {
        return this.emptySnapshot('finance', access, query);
      }
      invoiceWhere.order = {
        is: {
          employeeId: {
            in: scope.employeeIds
          }
        }
      };
    }

    const invoices = await this.prisma.client.invoice.findMany({
      where: invoiceWhere,
      include: {
        order: true,
        allocations: {
          orderBy: { allocatedAt: 'desc' },
          take: 5
        }
      },
      orderBy: { createdAt: 'desc' },
      take
    });

    const allowCompanyOnly = scope.companyWide;
    const [journalEntries, accounts, budgetPlans] = await Promise.all([
      allowCompanyOnly
        ? this.prisma.client.journalEntry.findMany({
            where: query.q
              ? {
                  OR: [
                    { entryNo: { contains: query.q, mode: 'insensitive' } },
                    { description: { contains: query.q, mode: 'insensitive' } }
                  ]
                }
              : undefined,
            orderBy: { createdAt: 'desc' },
            take
          })
        : Promise.resolve([]),
      allowCompanyOnly
        ? this.prisma.client.account.findMany({
            orderBy: { updatedAt: 'desc' },
            take
          })
        : Promise.resolve([]),
      allowCompanyOnly
        ? this.prisma.client.budgetPlan.findMany({
            orderBy: { updatedAt: 'desc' },
            take
          })
        : Promise.resolve([])
    ]);

    return {
      module: 'finance',
      scope: access.scope,
      query,
      snapshot: {
        invoices,
        journalEntries,
        accounts,
        budgetPlans,
        metrics: {
          invoiceCount: invoices.length,
          journalCount: journalEntries.length,
          accountCount: accounts.length,
          budgetCount: budgetPlans.length
        }
      }
    };
  }

  assertCanUseProxy(access: AssistantEffectiveAccess) {
    if (access.allowedModules.length === 0) {
      throw new ForbiddenException('Tài khoản hiện tại không có module nào được phép truy vấn AI proxy.');
    }
  }

  private emptySnapshot(module: string, access: AssistantEffectiveAccess, query: AssistantProxyQueryDto) {
    return {
      module,
      scope: access.scope,
      query,
      snapshot: {
        items: [],
        metrics: {}
      }
    };
  }

  private resolveEmployeeScope(access: AssistantEffectiveAccess) {
    return {
      companyWide: access.scope.type === 'company',
      employeeIds: this.unique(access.scope.employeeIds),
      orgUnitIds: this.unique(access.scope.orgUnitIds)
    };
  }

  private resolveActorScope(access: AssistantEffectiveAccess) {
    return {
      companyWide: access.scope.type === 'company',
      actorIds: this.unique(access.scope.actorIds)
    };
  }

  private unique(values: string[]) {
    return Array.from(new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean)));
  }

  private take(limitRaw: number | undefined) {
    const parsed = Number(limitRaw ?? 50);
    if (!Number.isFinite(parsed)) {
      return 50;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 200);
  }
}
