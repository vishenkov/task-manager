import _ from 'lodash';
import buildFormObj from '../lib/formObjectBuilder';
import fsm from '../lib/fsmTaskStatus';

export default (router, { Task, User, TaskStatus, TaskTag, Tag, logger }) => {
  router
    .get('editTask', '/task/:id/edit', async (ctx) => {
      if (!ctx.state.isSignedIn()) {
        ctx.throw(401);
        return;
      }
      const task = await Task.findOne({
        include: [
          { model: User, as: 'creator' },
          { model: User, as: 'assignedTo' },
          { model: TaskStatus, as: 'status' },
        ],
        where: {
          id: ctx.params.id,
        },
      });
      if (task) {
        const rawUsers = await User.findAll();
        const users = rawUsers.map(user => ({
          value: user.id,
          text: user.id === ctx.session.userId ? '>> me <<' : user.fullName,
          selected: task.assignedToId === user.id,
        }));

        const taskTags = await task.getTags();
        const tagIds = taskTags.map(tag => tag.id);
        const otherTags = await Tag.findAll({
          where: {
            id: {
              $notIn: tagIds,
            },
          },
        });
        let tags = taskTags.map(tag => ({
          text: tag.name,
          value: tag.id,
          checked: true,
        }));
        tags = otherTags.reduce((acc, tag) => ([
          ...acc,
          {
            text: tag.name,
            value: tag.id,
          },
        ]), tags);

        const availableStates = fsm(task.status.name).transitions();
        logger(availableStates);
        const availableStatuses = await TaskStatus.findAll({
          where: {
            name: {
              $in: availableStates,
            },
          },
        });
        const statuses = [...availableStatuses, task.status].map(status => ({
          value: status.id,
          text: status.name,
          selected: status.id === task.status.id,
        }));
        logger(statuses);
        ctx.render('task/edit', { f: buildFormObj(task), task, users, tags, statuses });
      } else {
        ctx.throw(404);
      }
    })

    .get('taskById', '/task/:id', async (ctx) => {
      const task = await Task.findOne({
        include: [
          { model: User, as: 'creator' },
          { model: User, as: 'assignedTo' },
          { model: TaskStatus, as: 'status' },
        ],
        where: {
          id: ctx.params.id,
        },
      });
      if (task) {
        const tags = await task.getTags();
        const taskTags = await TaskTag.findAll();
        const tagsDB = await Tag.findAll();
        ctx.render('task', { task, tags, taskTags, tagsDB });
      } else {
        ctx.throw(404);
      }
    })

    .patch('taskById', '/task/:id', async (ctx) => {
      if (!ctx.state.isSignedIn()) {
        ctx.throw(401);
        return;
      }
      const form = ctx.request.body.form;
      logger(form);
      const taskKeys = Object.keys(form).filter(key =>
        !_.includes(['assignedTo', 'tags', 'newTags', 'status'], key));
      logger(taskKeys);
      const taskBuild = taskKeys.reduce((acc, key) => {
        acc[key] = form[key];
        return acc;
      }, {});
      logger(taskBuild);

      const assignedUser = await User.findOne({
        where: {
          id: form.assignedTo,
        },
      });
      const status = await TaskStatus.findOne({
        where: {
          id: form.status,
        },
      });

      const newTags = (form.newTags instanceof Array ? form.newTags : [form.newTags])
        .reduce((acc, name) => {
          if (name) {
            return [...acc, Tag.build({ name })];
          }
          return acc;
        }, []);
      logger(newTags);
      const selectedTags = await Tag.findAll({
        where: {
          id: {
            $in: form.tags instanceof Array ? form.tags : [form.tags],
          },
        },
      });
      logger(selectedTags);

      try {
        if (newTags) {
          await Promise.all(newTags.map(tag => tag.save()));
        }
        await Task.update(
          {
            ...taskBuild,
          },
          {
            where: {
              id: ctx.params.id,
            },
          });
        const task = await Task.findOne({
          where: {
            id: ctx.params.id,
          },
        });
        await task.setTags([...selectedTags, ...newTags]);
        await task.setAssignedTo(assignedUser);
        await task.setStatus(status);
        ctx.flash.set('Task has been updated!');
        ctx.redirect(router.url('tasks'));
      } catch (e) {
        logger(e);
        ctx.redirect(router.url('tasks'));
      }
    })

    .delete('taskById', '/task/:id', async (ctx) => {
      if (!ctx.state.isSignedIn()) {
        ctx.throw(401);
        return;
      }
      const task = await Task.findOne({
        where: {
          id: ctx.params.id,
        },
      });
      if (task) {
        await task.destroy();
        ctx.flash.set('Task has been deleted!');
        ctx.redirect(router.url('tasks'));
      } else {
        ctx.throw(404);
      }
    });
};
